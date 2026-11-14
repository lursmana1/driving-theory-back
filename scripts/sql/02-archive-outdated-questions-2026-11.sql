-- Step 2 (AFTER the archived-questions code is deployed):
-- archive the 23 question ids that are not listed in any starti.ge category
-- (crawled 2026-11-12, see outdated-question-ids-to-remove.json).
-- Same effect as `npm run db:archive-outdated`, for the Coolify psql terminal.
-- Idempotent: safe to re-run; a second run moves 0 rows.
-- Needs 01-ensure-questions-archived.sql first. Take a Coolify backup first.

BEGIN;

-- Without step 1 the INSERT below fails and the transaction moves nothing.

WITH ids AS (
  SELECT unnest(ARRAY[
    181, 182, 184, 185, 270, 271, 337, 526, 827, 828, 842, 949,
    956, 981, 1066, 1068, 1076, 1079, 1085, 1428, 1572, 1635, 1650
  ]::int[]) AS id
),
moved AS (
  DELETE FROM questions q USING ids WHERE q.id = ids.id
  RETURNING q.*
)
INSERT INTO questions_archived (
  id, lang, question, question_explained, "hasImg", correct_answer,
  answer_1, answer_2, answer_3, answer_4, subject, categories,
  audio, ai_tutor, img, archived_at, archive_reason
)
SELECT
  id, lang, question, question_explained, "hasImg", correct_answer,
  answer_1, answer_2, answer_3, answer_4, subject, categories,
  audio, ai_tutor, img, NOW(), 'outdated_after_georgian_rules_update'
FROM moved
ON CONFLICT (id, lang) DO UPDATE SET
  question = EXCLUDED.question,
  question_explained = EXCLUDED.question_explained,
  "hasImg" = EXCLUDED."hasImg",
  correct_answer = EXCLUDED.correct_answer,
  answer_1 = EXCLUDED.answer_1,
  answer_2 = EXCLUDED.answer_2,
  answer_3 = EXCLUDED.answer_3,
  answer_4 = EXCLUDED.answer_4,
  subject = EXCLUDED.subject,
  categories = EXCLUDED.categories,
  audio = EXCLUDED.audio,
  ai_tutor = EXCLUDED.ai_tutor,
  img = EXCLUDED.img,
  archived_at = EXCLUDED.archived_at,
  archive_reason = EXCLUDED.archive_reason;

-- Expect: 0 live rows for these ids, 1236 distinct live ids (if prod matched local's 1259 before).
SELECT COUNT(*) AS still_live FROM questions WHERE id = ANY(ARRAY[
  181, 182, 184, 185, 270, 271, 337, 526, 827, 828, 842, 949,
  956, 981, 1066, 1068, 1076, 1079, 1085, 1428, 1572, 1635, 1650
]::int[]);
SELECT lang, COUNT(*) FROM questions GROUP BY lang ORDER BY lang;

COMMIT;
