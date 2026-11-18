import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DEFAULT_LANG } from '../common/constants/lang.constants.js';
import { STUDY_PLAN_QUESTION_CACHE_MS } from '../common/constants/study-plan.constants.js';
import { parsePgInt } from '../common/utils/pg-row.util.js';
import {
  cachedPromise,
  type PromiseCacheEntry,
} from '../common/utils/promise-cache.util.js';
import { Question } from '../questions/entities/question.entity.js';
import type { SubjectQuestions } from './study-plans.types.js';

type SubjectIdsRow = { subject: number | string; ids: (number | string)[] };

/**
 * `@>` (not `= ANY`) so Postgres can use `idx_questions_categories_gin`;
 * same rows for a non-null category id. Only `subject` and `id` are read.
 */
export const SUBJECT_QUESTION_IDS_SQL = `
  SELECT q.subject, array_agg(q.id ORDER BY q.id) AS ids
  FROM questions q
  WHERE q.lang = $1
    AND q.categories @> ARRAY[$2::int]
    AND q.subject IS NOT NULL
  GROUP BY q.subject`;

/**
 * Read side of the study plan. Question ids come from the `ka` rows (every
 * question has one); live questions only (`questions`, never the archive).
 */
@Injectable()
export class StudyPlansQueryService {
  /**
   * Per-process cache, one entry per category (0–9, so bounded): the bank
   * changes only when a sync script runs. Holds the promise, so concurrent
   * misses share one query; a failed load is dropped, not cached. The data
   * is shared and frozen: callers must not mutate it.
   */
  private readonly cache = new Map<
    number,
    PromiseCacheEntry<readonly SubjectQuestions[]>
  >();

  constructor(
    @InjectRepository(Question)
    private readonly questions: Repository<Question>,
  ) {}

  loadSubjectQuestions(
    categoryId: number,
    now = Date.now(),
  ): Promise<readonly SubjectQuestions[]> {
    return cachedPromise(
      this.cache,
      categoryId,
      STUDY_PLAN_QUESTION_CACHE_MS,
      () => this.querySubjectQuestions(categoryId),
      now,
    );
  }

  private async querySubjectQuestions(
    categoryId: number,
  ): Promise<readonly SubjectQuestions[]> {
    const rows = await this.questions.query<SubjectIdsRow[]>(
      SUBJECT_QUESTION_IDS_SQL,
      [DEFAULT_LANG, categoryId],
    );
    return Object.freeze(
      rows.map((row) =>
        Object.freeze({
          subjectId: parsePgInt(row.subject),
          questionIds: Object.freeze(row.ids.map((id) => parsePgInt(id))),
        }),
      ),
    );
  }

  /**
   * Full questions in `lang`, in the order of `ids` (primary key lookups).
   * A question missing in `lang` falls back to its `ka` row.
   */
  async loadQuestions(ids: number[], lang: string): Promise<Question[]> {
    if (ids.length === 0) return [];
    const rows = await this.questions.find({ where: { id: In(ids), lang } });
    const byId = new Map(rows.map((q) => [q.id, q]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0 && lang !== DEFAULT_LANG) {
      const fallback = await this.questions.find({
        where: { id: In(missing), lang: DEFAULT_LANG },
      });
      for (const q of fallback) byId.set(q.id, q);
    }
    return ids.flatMap((id) => {
      const q = byId.get(id);
      return q ? [q] : [];
    });
  }
}
