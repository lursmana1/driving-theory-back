import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DEFAULT_LANG } from '../common/constants/lang.constants.js';
import { STUDY_PLAN_QUESTION_CACHE_MS } from '../common/constants/study-plan.constants.js';
import { parsePgInt } from '../common/utils/pg-row.util.js';
import {
  cachedPromise,
  type PromiseCacheEntry,
} from '../common/utils/promise-cache.util.js';
import {
  buildPlanSubjects,
  type CardRef,
  type PlanSubjects,
  type PrimaryLink,
} from './schedule/plan-subjects.util.js';
import { StudyPlansQueryService } from './study-plans.query.service.js';
import type { LessonCard, PlanLesson } from './study-plans.types.js';

/** A card's text in one language (`ka` fallback), as sent to the client. */
type CardText = Omit<LessonCard, 'lessonId' | 'questionIds'>;

type CardTextRow = Omit<CardText, 'title'> & { title: string | null };

type CardGraph = { cards: CardRef[]; links: PrimaryLink[] };

/** Every card in teaching order (structure only, no text). */
const CARDS_SQL = `
  SELECT id, "subjectId" FROM learning_cards ORDER BY "subjectId", "order", id`;

/** Confirmed primary links: the card each ticket is taught under. */
const PRIMARY_LINKS_SQL = `
  SELECT "questionId", "cardId" FROM question_cards
  WHERE "primary" AND confirmed
  ORDER BY "questionId"`;

/** All cards, text in `lang` with a `ka` fallback. */
const CARD_TEXTS_SQL = `
  SELECT c.id, c.kind, c."signNumber", c.image,
         COALESCE(t.title, k.title) AS title,
         COALESCE(t.body, k.body) AS body,
         COALESCE(t.tutor, k.tutor) AS tutor,
         -- audio follows its text: never Georgian audio under an English text
         CASE WHEN t.tutor IS NOT NULL THEN t.audio ELSE k.audio END AS audio
  FROM learning_cards c
  LEFT JOIN learning_card_texts t ON t."cardId" = c.id AND t.lang = $1
  LEFT JOIN learning_card_texts k ON k."cardId" = c.id AND k.lang = $2`;

/**
 * Cards in the study plan: lessons of card subjects are whole cards, each
 * followed by its tickets (`buildPlanSubjects`).
 *
 * Cards, links and texts change only when a seed / link / audio script runs,
 * so all are cached per process (a few hundred rows each): the card graph
 * once, the plan input per category (0–9), the texts per language (ka/en/ru).
 * The plan input's `subjects` array keys the built schedules until it expires.
 */
@Injectable()
export class PlanCardsService {
  private readonly graphCache = new Map<'all', PromiseCacheEntry<CardGraph>>();
  private readonly subjectsCache = new Map<
    number,
    PromiseCacheEntry<PlanSubjects>
  >();
  private readonly textCache = new Map<
    string,
    PromiseCacheEntry<ReadonlyMap<string, CardText>>
  >();

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly queries: StudyPlansQueryService,
  ) {}

  /** The category's subjects for the schedule builder, card subjects by card. */
  loadPlanSubjects(categoryId: number): Promise<PlanSubjects> {
    return cachedPromise(
      this.subjectsCache,
      categoryId,
      STUDY_PLAN_QUESTION_CACHE_MS,
      async () => {
        const [bank, graph] = await Promise.all([
          this.queries.loadSubjectQuestions(categoryId),
          this.loadGraph(),
        ]);
        return buildPlanSubjects(bank, graph.cards, graph.links);
      },
    );
  }

  /**
   * The cards of `lessons` in lesson order, text in `lang`, each with its
   * tickets inside its lesson.
   */
  async loadLessonCards(
    lessons: readonly PlanLesson[],
    input: PlanSubjects,
    lang: string,
  ): Promise<LessonCard[]> {
    if (!lessons.some((l) => l.cardIds.length)) return [];
    const texts = await this.loadTexts(lang);
    return lessons.flatMap((lesson) => {
      const inLesson = new Set(lesson.questionIds);
      return lesson.cardIds.flatMap((id): LessonCard[] => {
        const text = texts.get(id);
        if (!text) return [];
        const tickets = input.cardTickets.get(id) ?? [];
        return [
          {
            ...text,
            lessonId: lesson.id,
            questionIds: tickets.filter((q) => inLesson.has(q)),
          },
        ];
      });
    });
  }

  private loadGraph(): Promise<CardGraph> {
    return cachedPromise(
      this.graphCache,
      'all',
      STUDY_PLAN_QUESTION_CACHE_MS,
      async () => {
        const [cards, links] = await Promise.all([
          this.db.query<{ id: string; subjectId: unknown }[]>(CARDS_SQL),
          this.db.query<{ questionId: unknown; cardId: string }[]>(
            PRIMARY_LINKS_SQL,
          ),
        ]);
        return {
          cards: cards.map((c) => ({
            id: c.id,
            subjectId: parsePgInt(c.subjectId),
          })),
          links: links.map((l) => ({
            questionId: parsePgInt(l.questionId),
            cardId: l.cardId,
          })),
        };
      },
    );
  }

  /** Keyed by a parsed language (ka / en / ru), so the cache stays bounded. */
  private loadTexts(lang: string): Promise<ReadonlyMap<string, CardText>> {
    return cachedPromise(
      this.textCache,
      lang,
      STUDY_PLAN_QUESTION_CACHE_MS,
      async () => {
        const rows = await this.db.query<CardTextRow[]>(CARD_TEXTS_SQL, [
          lang,
          DEFAULT_LANG,
        ]);
        return new Map(
          rows.map((r) => [
            r.id,
            { ...r, title: r.title ?? r.signNumber ?? r.id },
          ]),
        );
      },
    );
  }
}
