import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { TRAINER_CLEARED_WINDOW_DAYS } from '../common/constants/question-progress.constants.js';
import { SqlParams } from '../common/sql/sql-params.js';
import type {
  TrainerFilter,
  TrainerSessionRow,
  TrainerSummaryRow,
} from './mistake-trainer.types.js';

/**
 * Live questions of the user's progress rows in one category (and optional
 * subjects). Questions archived since are dropped by the inner join.
 */
function progressInCategorySql(sp: SqlParams, filter: TrainerFilter): string {
  const userPh = sp.add(filter.userId);
  const langPh = sp.add(filter.lang);
  const categoryPh = sp.add(filter.categoryId);
  const subjectWhere = filter.subjects?.length
    ? `AND q.subject = ANY(${sp.add(filter.subjects)}::int[])`
    : '';
  return `
    FROM question_progress qp
    INNER JOIN questions q
      ON q.id = qp."questionId"
     AND q.lang = ${langPh}
    WHERE qp."userId" = ${userPh}
      AND ${categoryPh}::int = ANY(q.categories)
      ${subjectWhere}`;
}

/** Read side of the mistake trainer. */
@Injectable()
export class MistakeTrainerQueryService {
  constructor(
    @InjectEntityManager()
    private readonly manager: EntityManager,
  ) {}

  /**
   * Active mistakes, due first, then most reviews left, most wrong, soonest
   * due.
   * Uses idx_question_progress_user_due; a user has at most a few hundred
   * active mistakes, so the sort is small.
   */
  async loadSession(
    filter: TrainerFilter,
    limit: number,
  ): Promise<TrainerSessionRow[]> {
    const sp = new SqlParams();
    const from = progressInCategorySql(sp, filter);
    const limitPh = sp.add(limit);
    return this.manager.query<TrainerSessionRow[]>(
      `
      SELECT
        q.id, q.lang, q.question, q.question_explained, q."hasImg",
        q.correct_answer, q.answer_1, q.answer_2, q.answer_3, q.answer_4,
        q.subject, q.categories, q.audio, q.ai_tutor, q.img,
        qp."wrongCount", qp."correctCount", qp.box, qp."dueAt", qp."clearedAt",
        qp."reviewsLeft"
      ${from}
        AND qp."dueAt" IS NOT NULL
      ORDER BY
        (qp."dueAt" <= NOW()) DESC,
        qp."reviewsLeft" DESC,
        qp."wrongCount" DESC,
        qp."dueAt" ASC,
        qp."questionId" ASC
      LIMIT ${limitPh}
      `,
      sp.all(),
    );
  }

  async loadSummary(filter: TrainerFilter): Promise<TrainerSummaryRow> {
    const sp = new SqlParams();
    const from = progressInCategorySql(sp, filter);
    const windowPh = sp.add(TRAINER_CLEARED_WINDOW_DAYS);
    const [row] = await this.manager.query<TrainerSummaryRow[]>(
      `
      SELECT
        COUNT(*) FILTER (WHERE qp."dueAt" IS NOT NULL)::int AS "activeMistakes",
        COUNT(*) FILTER (WHERE qp."dueAt" <= NOW())::int AS "dueNow",
        COUNT(*) FILTER (
          WHERE qp."clearedAt" >= NOW() - make_interval(days => ${windowPh}::int)
        )::int AS "clearedRecently",
        MIN(qp."dueAt") FILTER (WHERE qp."dueAt" > NOW()) AS "nextDueAt"
      ${from}
        AND (qp."dueAt" IS NOT NULL OR qp."clearedAt" IS NOT NULL)
      `,
      sp.all(),
    );
    return row;
  }
}
