import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  CARD_LESSON_DEFAULT_CARDS,
  CARD_LESSON_WITHOUT_CARD_MAX,
} from '../common/constants/learning-cards.constants.js';
import { DEFAULT_LANG } from '../common/constants/lang.constants.js';
import { STUDY_PLAN_QUESTION_CACHE_MS } from '../common/constants/study-plan.constants.js';
import { StudyPlansQueryService } from './study-plans.query.service.js';
import type { CardLesson, LessonCard } from './study-plans.types.js';

type CardRow = {
  id: string;
  kind: string;
  signNumber: string | null;
  image: string | null;
  title: string | null;
  body: string | null;
  tutor: string | null;
  audio: string | null;
};

/** A subject's cards in one language, with their confirmed primary tickets. */
type SubjectCards = {
  cards: readonly CardRow[];
  /** Card id → ticket ids taught under it (all categories). */
  primary: ReadonlyMap<string, readonly number[]>;
};

/** Cards of a subject in teaching order, text in `lang` with a `ka` fallback. */
const SUBJECT_CARDS_SQL = `
  SELECT c.id, c.kind, c."signNumber", c.image,
         COALESCE(t.title, k.title) AS title,
         COALESCE(t.body, k.body) AS body,
         COALESCE(t.tutor, k.tutor) AS tutor,
         -- audio follows its text: never Georgian audio under an English text
         CASE WHEN t.tutor IS NOT NULL THEN t.audio ELSE k.audio END AS audio
  FROM learning_cards c
  LEFT JOIN learning_card_texts t ON t."cardId" = c.id AND t.lang = $2
  LEFT JOIN learning_card_texts k ON k."cardId" = c.id AND k.lang = $3
  WHERE c."subjectId" = $1
  ORDER BY c."order", c.id`;

/** Confirmed primary links of a subject's cards. */
const SUBJECT_PRIMARY_LINKS_SQL = `
  SELECT q."questionId", q."cardId" FROM question_cards q
  JOIN learning_cards c ON c.id = q."cardId"
  WHERE c."subjectId" = $1 AND q."primary" AND q.confirmed
  ORDER BY q."questionId"`;

/** Every ticket that has a confirmed primary card (of any subject). */
const PRIMARY_LINKED_SQL = `
  SELECT "questionId" FROM question_cards WHERE "primary" AND confirmed`;

type CacheEntry<T> = { at: number; data: Promise<T> };

/**
 * Prototype of a card lesson: card → its tickets → next card. A ticket is
 * taught under its primary card; only tickets of the category are kept.
 * Tickets of the subject with no primary card come after its last card.
 *
 * Cards and links change only when a seed / link script runs, so they are
 * cached per process like the question bank (promise cache, failures dropped).
 * A request then only slices the cached lists and loads its page's tickets.
 */
@Injectable()
export class CardLessonsService {
  /** `subjectId|lang` → cards; bounded by subjects × languages. */
  private readonly subjectCache = new Map<string, CacheEntry<SubjectCards>>();
  private linkedCache: CacheEntry<ReadonlySet<number>> | null = null;

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly queries: StudyPlansQueryService,
  ) {}

  async getLesson(
    categoryId: number,
    subjectId: number,
    lang: string,
    from = 0,
    count = CARD_LESSON_DEFAULT_CARDS,
  ): Promise<CardLesson> {
    const [subject, bank] = await Promise.all([
      this.subjectCards(subjectId, lang),
      this.queries.loadSubjectQuestions(categoryId),
    ]);
    const total = subject.cards.length;
    if (from > 0 && from >= total) {
      throw new BadRequestException(`from must be below ${total}`);
    }

    // A ticket follows its primary card, even when the ticket's own subject
    // is another one (a priority-signs ticket about a warning sign).
    const inCategory = new Set(bank.flatMap((s) => s.questionIds));
    const cards: LessonCard[] = subject.cards
      .slice(from, from + count)
      .map((c) => ({
        id: c.id,
        kind: c.kind,
        signNumber: c.signNumber,
        image: c.image,
        title: c.title ?? c.signNumber ?? c.id,
        body: c.body,
        tutor: c.tutor,
        audio: c.audio,
        questionIds: (subject.primary.get(c.id) ?? []).filter((id) =>
          inCategory.has(id),
        ),
      }));

    let withoutCard: number[] = [];
    if (from + count >= total) {
      const subjectTickets =
        bank.find((s) => s.subjectId === subjectId)?.questionIds ?? [];
      const linked = await this.primaryLinked();
      withoutCard = subjectTickets
        .filter((id) => !linked.has(id))
        .slice(0, CARD_LESSON_WITHOUT_CARD_MAX);
    }

    const ids = [...cards.flatMap((c) => c.questionIds), ...withoutCard];
    return {
      categoryId,
      subjectId,
      from,
      totalCards: total,
      cards,
      withoutCard,
      questions: await this.queries.loadQuestions(ids, lang),
    };
  }

  private subjectCards(subjectId: number, lang: string): Promise<SubjectCards> {
    return cached(this.subjectCache, `${subjectId}|${lang}`, async () => {
      const [cards, links] = await Promise.all([
        this.db.query<CardRow[]>(SUBJECT_CARDS_SQL, [
          subjectId,
          lang,
          DEFAULT_LANG,
        ]),
        this.db.query<{ questionId: number; cardId: string }[]>(
          SUBJECT_PRIMARY_LINKS_SQL,
          [subjectId],
        ),
      ]);
      const primary = new Map<string, number[]>();
      for (const l of links) {
        const list = primary.get(l.cardId) ?? [];
        list.push(Number(l.questionId));
        primary.set(l.cardId, list);
      }
      return { cards, primary };
    });
  }

  private primaryLinked(now = Date.now()): Promise<ReadonlySet<number>> {
    const hit = this.linkedCache;
    if (hit && now - hit.at < STUDY_PLAN_QUESTION_CACHE_MS) return hit.data;
    const entry: CacheEntry<ReadonlySet<number>> = {
      at: now,
      data: this.db
        .query<{ questionId: number }[]>(PRIMARY_LINKED_SQL)
        .then((rows) => new Set(rows.map((r) => Number(r.questionId)))),
    };
    this.linkedCache = entry;
    entry.data.catch(() => {
      if (this.linkedCache === entry) this.linkedCache = null;
    });
    return entry.data;
  }
}

/** Promise cache with the question-bank TTL; a failed load is not kept. */
function cached<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  load: () => Promise<T>,
  now = Date.now(),
): Promise<T> {
  const hit = cache.get(key);
  if (hit && now - hit.at < STUDY_PLAN_QUESTION_CACHE_MS) return hit.data;
  const entry = { at: now, data: load() };
  cache.set(key, entry);
  entry.data.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  return entry.data;
}
