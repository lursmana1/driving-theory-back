import {
  MISTAKE_MAX_REVIEWS,
  MISTAKE_REVIEW_INTERVAL_DAYS,
} from '../common/constants/question-progress.constants';
import { studyDaySql, studyDayStartSql } from '../common/sql/study-day.sql';

const INTERVALS_SQL = `ARRAY[${MISTAKE_REVIEW_INTERVAL_DAYS.join(', ')}]::int[]`;

/** The incoming answer was given while the question was due. */
const IS_DUE_REVIEW = `qp."dueAt" <= EXCLUDED."lastAnsweredAt"`;
const IS_WRONG = `NOT EXCLUDED."lastResult"`;
/** This due review is the last one the mistake needs. */
const CLEARS = `qp."reviewsLeft" <= 1`;

/**
 * Reviews a wrong answer leaves: MAX − correct + wrong (this answer
 * included), within 1..MAX.
 */
const REVIEWS_AFTER_WRONG = `LEAST(GREATEST(
        ${MISTAKE_MAX_REVIEWS} - qp."correctCount" + qp."wrongCount" + 1, 1
      ), ${MISTAKE_MAX_REVIEWS})`;

/**
 * Start (04:00 Tbilisi) of the study day after the next interval step, as
 * timestamptz: `MISTAKE_REVIEW_INTERVAL_DAYS[box]`, the last step repeating.
 */
const NEXT_DUE = studyDayStartSql(
  `${studyDaySql('EXCLUDED."lastAnsweredAt"')}
            + (${INTERVALS_SQL})[LEAST(qp.box + 1, ${MISTAKE_REVIEW_INTERVAL_DAYS.length})]`,
);

/** Columns returned by `upsertQuestionProgressSql`. */
const PROGRESS_RETURNING_COLUMNS = `qp."questionId", qp."wrongCount", qp."correctCount", qp.box,
  qp."reviewsLeft", qp."lastResult", qp."dueAt", qp."clearedAt"`;

/**
 * Records graded answers into `question_progress` in one statement, for use
 * as a data-modifying CTE.
 *
 * `source` is a fixed subquery from code (never request text) yielding
 * `user_id int, question_id int, correct boolean, answered_at timestamptz`,
 * at most one row per (user_id, question_id) — Postgres rejects an upsert
 * that touches the same row twice.
 *
 * Rules (SET expressions read the row as it was before this answer):
 * - wrong: `reviewsLeft` = MAX − correctCount + wrongCount within 1..MAX
 *   (`MISTAKE_MAX_REVIEWS`), box 0 and due now; clears `clearedAt`.
 * - correct while due: one review done; the last one clears the mistake
 *   (`dueAt` NULL, `clearedAt` set), otherwise one box up and due at the
 *   start of the Georgian day `MISTAKE_REVIEW_INTERVAL_DAYS[box]` days later.
 * - correct before it is due, or never wrong: counted, schedule unchanged,
 *   so same-day cramming cannot clear a mistake.
 *
 * The row lock taken by ON CONFLICT serialises concurrent answers.
 */
export function upsertQuestionProgressSql(source: string): string {
  return `
  INSERT INTO question_progress AS qp (
    "userId", "questionId", "wrongCount", "correctCount", box, "reviewsLeft",
    "lastResult", "firstAnsweredAt", "lastAnsweredAt", "dueAt"
  )
  SELECT
    src.user_id,
    src.question_id,
    CASE WHEN src.correct THEN 0 ELSE 1 END,
    CASE WHEN src.correct THEN 1 ELSE 0 END,
    0,
    CASE WHEN src.correct THEN 0 ELSE ${MISTAKE_MAX_REVIEWS} END,
    src.correct,
    src.answered_at,
    src.answered_at,
    CASE WHEN src.correct THEN NULL ELSE src.answered_at END
  FROM ${source} src
  ON CONFLICT ("userId", "questionId") DO UPDATE SET
    "wrongCount" = qp."wrongCount" + EXCLUDED."wrongCount",
    "correctCount" = qp."correctCount" + EXCLUDED."correctCount",
    "reviewsLeft" = CASE
      WHEN ${IS_WRONG} THEN ${REVIEWS_AFTER_WRONG}
      WHEN ${IS_DUE_REVIEW} THEN GREATEST(qp."reviewsLeft" - 1, 0)
      ELSE qp."reviewsLeft"
    END,
    box = CASE
      WHEN ${IS_WRONG} THEN 0
      WHEN ${IS_DUE_REVIEW} THEN qp.box + 1
      ELSE qp.box
    END,
    "dueAt" = CASE
      WHEN ${IS_WRONG} THEN EXCLUDED."lastAnsweredAt"
      WHEN ${IS_DUE_REVIEW} THEN
        CASE WHEN ${CLEARS} THEN NULL ELSE ${NEXT_DUE} END
      ELSE qp."dueAt"
    END,
    "clearedAt" = CASE
      WHEN ${IS_WRONG} THEN NULL
      WHEN ${IS_DUE_REVIEW} AND ${CLEARS} THEN EXCLUDED."lastAnsweredAt"
      ELSE qp."clearedAt"
    END,
    "lastReviewedAt" = CASE
      WHEN ${IS_DUE_REVIEW} THEN EXCLUDED."lastAnsweredAt"
      ELSE qp."lastReviewedAt"
    END,
    "lastResult" = EXCLUDED."lastResult",
    "lastAnsweredAt" = EXCLUDED."lastAnsweredAt"
  RETURNING ${PROGRESS_RETURNING_COLUMNS}`;
}
