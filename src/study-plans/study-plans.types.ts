import type { PlanDepth } from '../common/constants/study-plan.constants.js';
import type { Question } from '../questions/entities/question.entity.js';

/**
 * One piece a lesson is never cut inside: a card with the tickets taught
 * under it (possibly none: the card then only teaches), or one ticket with
 * no card (`cardId` null).
 */
export type LessonUnit = {
  cardId: string | null;
  questionIds: readonly number[];
};

/** The mixed day exam: yesterday's extra tickets, today's new ones, older ones. */
export type DayExamParts = { carry: number; today: number; older: number };

/** Live question ids of one subject in one category. */
export type SubjectQuestions = {
  subjectId: number;
  questionIds: readonly number[];
  /**
   * Card subjects only: the subject in teaching order, card by card, then
   * its tickets with no card. `questionIds` is then the same ids, flattened.
   */
  units?: readonly LessonUnit[];
};

/** 6–14 questions (cards count as one) of one subject. Id `<subjectId>-<part>`. */
export type PlanLesson = {
  id: string;
  subjectId: number;
  /** 1-based part of the subject, out of `parts`. */
  part: number;
  parts: number;
  /** Taught in the lesson, in order: each card's first tickets right after it. */
  questionIds: number[];
  /**
   * A card's tickets beyond the taught ones. Full plans ask them in the next
   * day's exam (`PlanDay.carryIds`); short plans put them in the optional
   * `extra` rounds (`PlanDay.optionalIds`).
   */
  restIds: number[];
  /** Cards taught in this lesson, in order; empty for subjects with no cards. */
  cardIds: string[];
};

export type PlanStepKind =
  | 'learn'
  | 'review'
  | 'mix'
  | 'test'
  | 'exam'
  /** Short plans, optional: the day's remaining tickets. */
  | 'extra';

export type PlanStep = {
  kind: PlanStepKind;
  /** Only on `learn` steps. */
  lessonId?: string;
  /** Questions in the step (`review`: at most this many due cards). */
  questionCount: number;
  /** `learn` steps of card lessons: cards taught before / between tickets. */
  cardCount?: number;
  /** `test` (mixed day exam): how many tickets of each kind it holds. */
  examParts?: DayExamParts;
};

export type PlanDayKind = 'learn' | 'review';

export type PlanDay = {
  /** 0-based. */
  index: number;
  /** Study day `YYYY-MM-DD` (Tbilisi, starts at 04:00). */
  date: string;
  kind: PlanDayKind;
  lessons: PlanLesson[];
  /** Extra tickets of the previous learn day's lessons, asked in today's day exam. */
  carryIds: number[];
  /**
   * Short plans: optional tickets for today's `extra` round, spread evenly
   * over the learn days (never before their card is taught).
   */
  optionalIds: number[];
  newQuestions: number;
  steps: PlanStep[];
  minutes: number;
};

export type PlanSchedule = {
  dayCount: number;
  /** `short` up to `STUDY_PLAN_SHORT_MAX_DAYS`: essentials first. */
  mode: PlanDepth['mode'];
  /** Short plans: tickets in the optional `extra` steps (not required). */
  optionalQuestions: number;
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

/** Preview lessons go out without question / card ids. */
export type PreviewLesson = Omit<
  PlanLesson,
  'questionIds' | 'cardIds' | 'restIds'
> & {
  questionCount: number;
  cardCount: number;
};

export type PreviewDay = Omit<
  PlanDay,
  'lessons' | 'carryIds' | 'optionalIds'
> & {
  lessons: PreviewLesson[];
};

export type StudyPlanPreview = Omit<PlanSchedule, 'days'> & {
  categoryId: number;
  startDay: string;
  /** Exam study day when the plan was built from a date, else null. */
  examDay: string | null;
  /** Shorter than the recommended minimum (14 days). */
  intensive: boolean;
  /**
   * Shortest plan whose average day fits `STUDY_PLAN_TARGET_MINUTES`; null
   * when even the longest plan doesn't.
   */
  daysForTargetMinutes: number | null;
  /** The daily time `daysForTargetMinutes` aims at (`STUDY_PLAN_TARGET_MINUTES`). */
  targetMinutes: number;
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
  /** `learn` steps of card lessons. */
  cardCount?: number;
};

/** `GET /study-plans/preview/days/:index`. */
export type PlanDaySession = Omit<PreviewDay, 'steps'> & {
  categoryId: number;
  dayCount: number;
  steps: DaySessionStep[];
  /** Cards of the day's lessons (`PlanLesson.cardIds`), text in `lang`. */
  cards: LessonCard[];
  questions: Question[];
};

export type DayTestResult = { correct: number; total: number; passed: boolean };

/** Same shape the frontend keeps for guests in localStorage. */
export type StudyPlanProgress = {
  /** dayIndex → step index → study day `YYYY-MM-DD` it was done. */
  done: Record<string, Record<string, string>>;
  /** dayIndex → best day test result. */
  tests: Record<string, DayTestResult>;
  /** dayIndex → question ids answered wrong that day and not fixed yet. */
  mistakes: Record<string, number[]>;
};

export type SavedStudyPlanView = {
  categoryId: number;
  dayCount: number;
  startDay: string;
  examDay: string | null;
  done: StudyPlanProgress['done'];
  tests: StudyPlanProgress['tests'];
  mistakes: StudyPlanProgress['mistakes'];
  updatedAt: Date;
};

/** One card of a day's lessons, text in the requested language. */
export type LessonCard = {
  id: string;
  /** The day lesson (`PlanLesson.id`) that teaches it. */
  lessonId: string;
  kind: string;
  signNumber: string | null;
  image: string | null;
  title: string;
  body: string | null;
  tutor: string | null;
  audio: string | null;
  /** Tickets taught right after this card in its lesson (this category). */
  questionIds: number[];
};
