import type { Question } from '../questions/entities/question.entity.js';

/** Live question ids of one subject in one category. */
export type SubjectQuestions = {
  subjectId: number;
  questionIds: readonly number[];
};

/** 6–14 questions of one subject. Id `<subjectId>-<part>`. */
export type PlanLesson = {
  id: string;
  subjectId: number;
  /** 1-based part of the subject, out of `parts`. */
  part: number;
  parts: number;
  questionIds: number[];
};

export type PlanStepKind = 'learn' | 'review' | 'mix' | 'test' | 'exam';

export type PlanStep = {
  kind: PlanStepKind;
  /** Only on `learn` steps. */
  lessonId?: string;
  /** Questions in the step (`review`: at most this many due cards). */
  questionCount: number;
};

export type PlanDayKind = 'learn' | 'review';

export type PlanDay = {
  /** 0-based. */
  index: number;
  /** Study day `YYYY-MM-DD` (Tbilisi, starts at 04:00). */
  date: string;
  kind: PlanDayKind;
  lessons: PlanLesson[];
  newQuestions: number;
  steps: PlanStep[];
  minutes: number;
};

export type PlanSchedule = {
  dayCount: number;
  learnDays: number;
  lessonSize: number;
  totalQuestions: number;
  minutesPerDayAvg: number;
  minutesPerDayMax: number;
  days: PlanDay[];
};

export type ScheduleInput = {
  subjects: readonly SubjectQuestions[];
  dayCount: number;
  /** First study day `YYYY-MM-DD`. */
  startDay: string;
  /** Questions in one full exam of the category (`getExamRules`). */
  examQuestionCount: number;
};

/** Preview lessons go out without question ids. */
export type PreviewLesson = Omit<PlanLesson, 'questionIds'> & {
  questionCount: number;
};

export type PreviewDay = Omit<PlanDay, 'lessons'> & {
  lessons: PreviewLesson[];
};

export type StudyPlanPreview = Omit<PlanSchedule, 'days'> & {
  categoryId: number;
  startDay: string;
  /** Exam study day when the plan was built from a date, else null. */
  examDay: string | null;
  /** Shorter than the recommended minimum (14 days). */
  intensive: boolean;
  days: PreviewDay[];
};

/** Plan length input: a preset day count or an exam study day. */
export type PlanQuery = {
  categoryId: number;
  days?: number;
  examDay?: string;
};

/** One step of a day with the question ids it uses. */
export type DaySessionStep = {
  kind: PlanStepKind;
  lessonId?: string;
  /** Empty for `review` (due cards come from the trainer) and `exam`. */
  questionIds: number[];
  questionCount: number;
};

/** `GET /study-plans/preview/days/:index`. */
export type PlanDaySession = Omit<PreviewDay, 'steps'> & {
  categoryId: number;
  dayCount: number;
  steps: DaySessionStep[];
  questions: Question[];
};

export type DayTestResult = { correct: number; total: number; passed: boolean };

/** Same shape the frontend keeps for guests in localStorage. */
export type StudyPlanProgress = {
  /** dayIndex → step index → study day `YYYY-MM-DD` it was done. */
  done: Record<string, Record<string, string>>;
  /** dayIndex → best day test result. */
  tests: Record<string, DayTestResult>;
};

export type SavedStudyPlanView = {
  categoryId: number;
  dayCount: number;
  startDay: string;
  examDay: string | null;
  done: StudyPlanProgress['done'];
  tests: StudyPlanProgress['tests'];
  updatedAt: Date;
};
