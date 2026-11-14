-- Step 1 (BEFORE deploying the archived-questions code): create the empty
-- questions_archived table. The exam answer query reads it, so without it
-- every exam answer fails. Same as `npm run db:ensure-questions-archived`.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS questions_archived (
  id int NOT NULL,
  lang varchar(5) NOT NULL,
  question text NOT NULL,
  question_explained text,
  "hasImg" smallint NOT NULL DEFAULT 0,
  correct_answer varchar(10),
  answer_1 text,
  answer_2 text,
  answer_3 text,
  answer_4 text,
  subject int,
  categories int[] NOT NULL DEFAULT '{}',
  audio varchar(512),
  ai_tutor text,
  img varchar(512),
  archived_at timestamptz NOT NULL DEFAULT NOW(),
  archive_reason text,
  PRIMARY KEY (id, lang)
);

-- Expect: t
SELECT to_regclass('public.questions_archived') IS NOT NULL AS ready;
