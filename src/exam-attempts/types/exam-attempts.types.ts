export interface StartAttemptOptions {
  lang: string;
  count?: number;
  subjects?: number[];
  categories?: number[];
  allSubjects?: boolean;
}

export interface AttemptSummary {
  id: number;
  questionCount: number;
  answeredCount: number;
  correctCount: number;
  createdAt: Date;
  completedAt: Date | null;
}

export interface PaginatedAttempts {
  data: AttemptSummary[];
  total: number;
  page: number;
  totalPages: number;
}

export interface RawAnswerRow {
  questionId: number;
  subject: number;
  correct: boolean;
  chosenAnswer: string;
  createdAt: Date;
}
