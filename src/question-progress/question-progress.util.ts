import { parsePgInt } from '../common/utils/pg-row.util.js';
import type {
  QuestionProgressRow,
  QuestionProgressStatus,
  QuestionProgressView,
} from './question-progress.types.js';

function toDate(value: Date | string | null): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

export function toQuestionProgressView(
  row: QuestionProgressRow,
  now: Date,
): QuestionProgressView {
  const dueAt = toDate(row.dueAt);

  let status: QuestionProgressStatus = 'correct';
  if (dueAt) status = 'mistake';
  else if (row.clearedAt != null) status = 'cleared';

  return {
    status,
    due: dueAt != null && dueAt.getTime() <= now.getTime(),
    dueAt,
    reviewsLeft:
      status === 'mistake' ? Math.max(parsePgInt(row.reviewsLeft), 1) : 0,
    wrongCount: parsePgInt(row.wrongCount),
    correctCount: parsePgInt(row.correctCount),
  };
}
