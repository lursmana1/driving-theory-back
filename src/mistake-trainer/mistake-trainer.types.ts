import type { QuestionProgressView } from '../question-progress/question-progress.types.js';

/** Question fields sent to the trainer — same as a ticket from exam start. */
export type TrainerQuestion = {
  id: number;
  lang: string;
  question: string;
  question_explained: string | null;
  hasImg: number;
  correct_answer: string | null;
  answer_1: string | null;
  answer_2: string | null;
  answer_3: string | null;
  answer_4: string | null;
  subject: number | null;
  categories: number[];
  audio: string | null;
  ai_tutor: string | null;
  img: string | null;
};

export type TrainerSessionRow = TrainerQuestion & {
  wrongCount: number | string;
  correctCount: number | string;
  box: number | string;
  dueAt: Date | string | null;
  clearedAt: Date | string | null;
  reviewsLeft: number | string;
};

export type TrainerSummaryRow = {
  activeMistakes: number | string;
  dueNow: number | string;
  clearedRecently: number | string;
  nextDueAt: Date | string | null;
};

export type TrainerSummary = {
  /** Mistakes not cleared yet, in this category. */
  activeMistakes: number;
  /** Of those, due for review now. */
  dueNow: number;
  /** Cleared in the last `TRAINER_CLEARED_WINDOW_DAYS` days. */
  clearedRecently: number;
  /** Earliest review scheduled after now; null when none. */
  nextDueAt: Date | null;
};

export type TrainerSessionItem = {
  question: TrainerQuestion;
  progress: QuestionProgressView;
};

export type TrainerSessionResponse = {
  /** Due mistakes first, then the rest of the active mistakes. */
  data: TrainerSessionItem[];
  summary: TrainerSummary;
};

export type TrainerFilter = {
  userId: number;
  categoryId: number;
  lang: string;
  subjects?: number[];
};
