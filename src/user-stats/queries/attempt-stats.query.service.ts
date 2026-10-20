import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import {
  READINESS_MAX_ATTEMPTS,
  EARLY_FAIL_WINDOW,
} from '../../common/constants/exam.constants.js';
import { resolveGeorgianExamRule } from '../../common/utils/georgian-exam-rules.util.js';
import {
  attemptMatchesCategorySql,
  categoryFilterJson,
  liveQuestionJoinSql,
} from '../../common/utils/attempt-category-filter.util.js';
import { parsePgBoolean, parsePgInt } from '../../common/utils/pg-row.util.js';
import type { RecentAttemptRow } from '../user-stats.types.js';

/** Completed-exam history that feeds the readiness score. */
@Injectable()
export class AttemptStatsQueryService {
  constructor(
    @InjectEntityManager()
    private readonly manager: EntityManager,
  ) {}

  /**
   * Most recent full exams with per-attempt score and early-window wrong
   * count, plus the total of all full exams in the category. Only live
   * questions are graded.
   *
   * Full exam = official ticket size and every subject of the category (the
   * picker sends the whole list, older clients send none). An attempt counts
   * once finished with at least one answer, or once expired with at least one
   * wrong answer — closing the tab after a mistake does not hide the exam, but
   * an interrupted clean run is not turned into a fail.
   */
  async loadRecentCompletedAttempts(
    userId: number,
    categoryId: number,
  ): Promise<{ rows: RecentAttemptRow[]; completedTotal: number }> {
    const categoryFilter = categoryFilterJson(categoryId);
    const rule = resolveGeorgianExamRule({ categories: [categoryId] });
    const fallbackThreshold = rule.minCorrectToPass;

    const rows = await this.manager.query<
      {
        id: string;
        minCorrectToPass: string | null;
        passed: boolean | string | null;
        correctCount: string;
        answeredCount: string;
        earlyWrongCount: string;
        completedTotal: string;
      }[]
    >(
      `
      WITH completed AS (
        SELECT
          t.id,
          t."minCorrectToPass",
          t.passed,
          COALESCE(t."completedAt", t."endDate") AS "settledAt"
        FROM exam_attempts t
        WHERE t."userId" = $1
          AND jsonb_array_length(t."questionIds") = $6
          AND (
            jsonb_array_length(t.subjects) = 0
            OR t.subjects @> COALESCE(
              (
                SELECT jsonb_path_query_array(c.subjects, '$[*].id')
                FROM categories c
                WHERE c.id = $3
              ),
              '[]'::jsonb
            )
          )
          AND (
            (
              t."completedAt" IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM user_answers ua WHERE ua."attemptId" = t.id
              )
            )
            OR (
              t."completedAt" IS NULL
              AND t."endDate" < NOW()
              AND EXISTS (
                SELECT 1 FROM user_answers ua
                WHERE ua."attemptId" = t.id AND ua.correct = false
              )
            )
          )
          AND ${attemptMatchesCategorySql('t', '$2', '$3')}
      ),
      recent AS (
        SELECT * FROM completed
        ORDER BY completed."settledAt" DESC
        LIMIT $4
      ),
      answer_stats AS (
        SELECT
          a."attemptId" AS "attemptId",
          SUM(CASE WHEN a.correct = true THEN 1 ELSE 0 END)::int AS "correctCount",
          COUNT(*)::int AS "answeredCount"
        FROM user_answers a
        INNER JOIN exam_attempts t ON a."attemptId" = t.id
        ${liveQuestionJoinSql('a', 't')}
        WHERE a."attemptId" IN (SELECT id FROM recent)
        GROUP BY a."attemptId"
      ),
      early AS (
        SELECT
          ranked."attemptId" AS "attemptId",
          COUNT(*) FILTER (WHERE ranked.correct = false)::int AS "earlyWrongCount"
        FROM (
          SELECT
            a."attemptId",
            a.correct,
            ROW_NUMBER() OVER (
              PARTITION BY a."attemptId"
              ORDER BY a."createdAt" ASC, a.id ASC
            ) AS rn
          FROM user_answers a
          INNER JOIN exam_attempts t ON a."attemptId" = t.id
          ${liveQuestionJoinSql('a', 't')}
          WHERE a."attemptId" IN (SELECT id FROM recent)
        ) ranked
        WHERE ranked.rn <= $5
        GROUP BY ranked."attemptId"
      )
      SELECT
        r.id,
        r."minCorrectToPass",
        r.passed,
        COALESCE(s."correctCount", 0)::text AS "correctCount",
        COALESCE(s."answeredCount", 0)::text AS "answeredCount",
        COALESCE(e."earlyWrongCount", 0)::text AS "earlyWrongCount",
        (SELECT COUNT(*) FROM completed)::text AS "completedTotal"
      FROM recent r
      LEFT JOIN answer_stats s ON s."attemptId" = r.id
      LEFT JOIN early e ON e."attemptId" = r.id
      ORDER BY r."settledAt" DESC
      `,
      [
        userId,
        categoryFilter,
        categoryId,
        READINESS_MAX_ATTEMPTS,
        EARLY_FAIL_WINDOW,
        rule.questionCount,
      ],
    );

    return {
      // No recent rows means no full exams at all, so 0 is exact.
      completedTotal: parsePgInt(rows[0]?.completedTotal),
      rows: rows.map((row) => {
        const correctCount = parsePgInt(row.correctCount);
        const minCorrectToPass = parsePgInt(
          row.minCorrectToPass,
          fallbackThreshold,
        );
        return {
          correctCount,
          minCorrectToPass,
          // Expired attempts nobody finished are graded on the answers given.
          passed:
            row.passed == null
              ? correctCount >= minCorrectToPass
              : parsePgBoolean(row.passed),
          answeredCount: parsePgInt(row.answeredCount),
          earlyWrongCount: parsePgInt(row.earlyWrongCount),
        };
      }),
    };
  }
}
