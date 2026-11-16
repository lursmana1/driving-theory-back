import type { Question } from '../questions/entities/question.entity';
import { parsePgInt } from '../common/utils/pg-row.util.js';

/**
 * Archived rows for a past attempt ($1 = lang, $2 = int[] of ids).
 * Same columns as `questions`; created by `npm run db:ensure-questions-archived`.
 */
export const ARCHIVED_QUESTIONS_BY_IDS_SQL = `
SELECT
  id, lang, question, question_explained, "hasImg", correct_answer,
  answer_1, answer_2, answer_3, answer_4, subject, categories,
  audio, ai_tutor, img
FROM questions_archived
WHERE lang = $1
  AND id = ANY($2::int[])
`;

export const QUESTIONS_ARCHIVED_EXISTS_SQL = `
SELECT to_regclass('public.questions_archived') IS NOT NULL AS exists
`;

export type ArchivedQuestionRow = {
  id: number | string;
  lang: string;
  question: string;
  question_explained: string | null;
  hasImg: number | string | null;
  correct_answer: string | null;
  answer_1: string | null;
  answer_2: string | null;
  answer_3: string | null;
  answer_4: string | null;
  subject: number | string | null;
  categories: number[] | null;
  audio: string | null;
  ai_tutor: string | null;
  img: string | null;
};

/** Raw archive row → the same shape the live `Question` entity returns. */
export function toQuestionFromArchivedRow(row: ArchivedQuestionRow): Question {
  return {
    id: parsePgInt(row.id),
    lang: row.lang,
    question: row.question,
    question_explained: row.question_explained as string,
    hasImg: parsePgInt(row.hasImg),
    correct_answer: row.correct_answer as string,
    answer_1: row.answer_1 as string,
    answer_2: row.answer_2 as string,
    answer_3: row.answer_3 as string,
    answer_4: row.answer_4 as string,
    subject: row.subject == null ? null : parsePgInt(row.subject),
    categories: (row.categories ?? []).map((c) => parsePgInt(c)),
    audio: row.audio as string,
    ai_tutor: row.ai_tutor as string,
    img: row.img as string,
  };
}
