/**
 * - `mistake`: answered wrong and not cleared yet (in the trainer queue).
 * - `cleared`: was a mistake, cleared by spaced reviews.
 * - `correct`: answered, never wrong (or wrong before tracking started).
 */
export type QuestionProgressStatus = 'mistake' | 'cleared' | 'correct';

/** Progress fields as raw query rows deliver them (counts may be strings). */
export type QuestionProgressRow = {
  wrongCount: number | string;
  correctCount: number | string;
  box: number | string;
  dueAt: Date | string | null;
  clearedAt: Date | string | null;
  reviewsLeft: number | string;
};

/** Progress as the API returns it. */
export type QuestionProgressView = {
  status: QuestionProgressStatus;
  /** Mistake whose review is due now. */
  due: boolean;
  dueAt: Date | null;
  /** Correct due reviews still needed to clear; 0 unless status is mistake. */
  reviewsLeft: number;
  wrongCount: number;
  correctCount: number;
};
