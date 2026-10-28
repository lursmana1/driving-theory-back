import { upsertQuestionProgressSql } from '../question-progress/question-progress.sql.js';

/**
 * One Postgres round trip for POST /practice-answers.
 *
 * Grades against the live question, upserts the practice row and, for a
 * graded answer, updates question_progress. `$4` NULL means seen-only: the
 * stored grade, choice and `updatedAt` are kept, and progress is untouched.
 * A graded re-answer always moves `updatedAt`, so recency-based weakness
 * sees it even when the choice is the same as last time.
 *
 * No row means the question is not in the live bank for that lang.
 * Needs the unique constraint uq_practice_answers_user_question_lang.
 */
export const RECORD_PRACTICE_SQL = `
WITH input AS (
  SELECT
    $1::int AS user_id,
    $2::int AS question_id,
    $3::varchar AS lang,
    $4::text AS chosen
),
graded AS (
  SELECT
    q.id,
    q.subject,
    CASE
      WHEN i.chosen IS NULL THEN NULL
      ELSE COALESCE(q.correct_answer = i.chosen, false)
    END AS correct
  FROM questions q
  JOIN input i ON q.id = i.question_id AND q.lang = i.lang
),
saved AS (
  INSERT INTO practice_answers AS p
    ("userId", "questionId", lang, subject, correct, "chosenAnswer")
  SELECT i.user_id, g.id, i.lang, g.subject, g.correct, i.chosen
  FROM graded g
  CROSS JOIN input i
  ON CONFLICT ("userId", "questionId", lang) DO UPDATE SET
    subject = EXCLUDED.subject,
    correct = COALESCE(EXCLUDED.correct, p.correct),
    "chosenAnswer" = CASE
      WHEN EXCLUDED.correct IS NULL THEN p."chosenAnswer"
      ELSE EXCLUDED."chosenAnswer"
    END,
    "updatedAt" = CASE
      WHEN EXCLUDED.correct IS NULL THEN p."updatedAt"
      ELSE NOW()
    END
  RETURNING p."questionId", p.lang, p.subject, p.correct
),
progressed AS (${upsertQuestionProgressSql(`(
    SELECT i.user_id, g.id AS question_id, g.correct, NOW() AS answered_at
    FROM graded g
    CROSS JOIN input i
    WHERE g.correct IS NOT NULL
  )`)}
)
SELECT
  s."questionId",
  s.lang,
  s.subject,
  s.correct,
  pr."wrongCount",
  pr."correctCount",
  pr.box,
  pr."dueAt",
  pr."clearedAt",
  pr."reviewsLeft"
FROM saved s
LEFT JOIN progressed pr ON TRUE
`;

export type RecordPracticeRow = {
  questionId: number | string;
  lang: string;
  subject: number | string | null;
  correct: boolean | string | null;
  /** Progress columns are NULL for a seen-only call. */
  wrongCount: number | string | null;
  correctCount: number | string | null;
  box: number | string | null;
  dueAt: Date | string | null;
  clearedAt: Date | string | null;
  reviewsLeft: number | string | null;
};
