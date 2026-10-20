export type ReadinessConfidence = 'none' | 'low' | 'medium' | 'high';

export type ReadinessAttemptInput = {
  correctCount: number;
  minCorrectToPass: number;
  passed: boolean;
  answeredCount?: number;
  earlyWrongCount?: number;
};

export type ReadinessSubjectInput = {
  subjectId: number;
  correctCount: number;
  wrongCount: number;
  distinctQuestionsAnswered: number;
  totalQuestions: number;
};

export type ComputeReadinessInput = {
  /** Full exams only (all subjects, official ticket size), most recent first. */
  attempts: ReadinessAttemptInput[];
  subjects: ReadinessSubjectInput[];
  subjectsTotal: number;
  questionCount: number;
  minCorrectToPass: number;
  passRate: number;
  minSubjectAttempts?: number;
  completedAttemptsTotal?: number;
  recentExamLimit?: number;
  readyScoreThreshold?: number;
  readyPracticeThreshold?: number;
  readyPassStreak?: number;
};

export type ReadinessResult = {
  /** Chance to pass an official ticket, 0–100. */
  readinessScore: number;
  confidence: ReadinessConfidence;
  readyForExam: boolean;
  label: string;
  /** Share of the recent full exams that were passed (0–1). */
  examAccuracy: number;
  /** Estimated per-question accuracy (0–1) behind the score. */
  answerAccuracy: number;
  /** Covered topics / total (0–1). */
  practicePart: number;
  coverageFactor: number;
  earlyFailCount: number;
  lastAttemptPassed: boolean | null;
  completedAttemptsTotal: number;
  completedAttemptsUsed: number;
  subjectsCovered: number;
  subjectsMastered: number;
  subjectsTotal: number;
  weakSubjectsCount: number;
};
