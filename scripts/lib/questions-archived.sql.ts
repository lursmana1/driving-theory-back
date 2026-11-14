/**
 * `questions_archived`: same columns as `questions` + archive metadata.
 * Shared by `ensure-questions-archived.ts` and `archive-outdated-questions.ts`.
 * Keep in sync with scripts/sql/01-ensure-questions-archived.sql.
 */
export const CREATE_QUESTIONS_ARCHIVED_SQL = `
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
  )
`;
