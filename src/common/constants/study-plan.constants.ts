/**
 * Study plan builder defaults. Research and reasoning:
 * prava `plans/reports/Study plan design research.md` and `docs/study-plan-roadmap.md`.
 * These are starting points to tune on real cohorts, not findings.
 */

/** A study day on the wire: `YYYY-MM-DD` (shape only; see `isStudyDay`). */
export const STUDY_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Preset plan lengths for learners without a booked exam. 7 is "intensive". */
export const STUDY_PLAN_PRESET_DAYS = [7, 14, 28] as const;

/** Plan lengths below this get no new-lesson plan (exam in 0–2 days). */
export const STUDY_PLAN_MIN_DAYS = 3;

/** Past this the daily dose is too thin to feel like a plan. */
export const STUDY_PLAN_MAX_DAYS = 60;

/** Below this many days the plan is labelled intensive. */
export const STUDY_PLAN_RECOMMENDED_MIN_DAYS = 14;

/**
 * Review days at the end (no new lessons), by plan length: the owner wants
 * the time used for learning, so at most 3. `[fromDays, reviewDays]`,
 * longest first: 40+ days → 3, 28+ → 2, shorter → 1.
 */
export const STUDY_PLAN_REVIEW_DAYS_BY_LENGTH: readonly (readonly [
  number,
  number,
])[] = [
  [40, 3],
  [28, 2],
  [0, 1],
];

/** Lesson size bounds (questions of one subject; a card counts as one). */
export const STUDY_PLAN_LESSON_MIN = 6;
export const STUDY_PLAN_LESSON_MAX = 14;

/** Target lessons per learn day; lesson size = new questions per day / this. */
export const STUDY_PLAN_LESSONS_PER_DAY_TARGET = 4;

/** How many neighbouring subjects are interleaved at once. */
export const STUDY_PLAN_INTERLEAVE_WINDOW = 3;

/** Every n-th learn day also gets the full mock exam. */
export const STUDY_PLAN_MOCK_EVERY_LEARN_DAYS = 3;

/** Full mock exams on each review day (after the mistakes review). */
export const STUDY_PLAN_REVIEW_DAY_MOCKS = 2;

/**
 * Plan depth by length. Full plans cover every ticket: a card's first 2
 * tickets in the lesson, its other tickets in the next day's exam, and signs
 * that have no ticket in the category still get a card. Short plans (like
 * 1-week / 2-week exam-prep schedules) teach the essentials: 1 ticket per
 * card, the other tickets stay optional (tickets page, trainer), and signs
 * not on the category's exam are left out.
 */
export const STUDY_PLAN_SHORT_MAX_DAYS = 21;

export type PlanDepth = {
  mode: 'full' | 'short';
  /** Tickets taught right after their card. */
  ticketsPerCard: number;
  /** A card's other tickets come back in the next day's exam (else optional). */
  extrasInPlan: boolean;
  /** Cards with no ticket in the category are still taught. */
  teachingOnlyCards: boolean;
};

export const STUDY_PLAN_DEPTH_FULL: PlanDepth = {
  mode: 'full',
  ticketsPerCard: 2,
  extrasInPlan: true,
  teachingOnlyCards: true,
};

export const STUDY_PLAN_DEPTH_SHORT: PlanDepth = {
  mode: 'short',
  ticketsPerCard: 1,
  extrasInPlan: false,
  teachingOnlyCards: false,
};

/** Daily time the picker steers towards ("for ~30 min a day, start N days before"). */
export const STUDY_PLAN_TARGET_MINUTES = 30;

/**
 * The mixed day exam that closes a learn day (step `test`): yesterday's extra
 * tickets (all), today's new ones, and a few older ones, exam-style.
 * Target size is a share of the category's full exam (B: 30 → 15); it grows
 * when yesterday left more extras, up to `STUDY_PLAN_TEST_MAX_QUESTIONS`.
 */
export const STUDY_PLAN_DAY_EXAM_SHARE = 0.5;
/** Older tickets (before yesterday) mixed into the day exam. */
export const STUDY_PLAN_DAY_EXAM_OLDER = 3;
/** Today's tickets in the day exam, at least (when the day has them). */
export const STUDY_PLAN_DAY_EXAM_MIN_TODAY = 5;

/** Step sizes (questions). */
export const STUDY_PLAN_REVIEW_MAX_QUESTIONS = 12;
/** Review days (no new lessons) get a bigger review step. */
export const STUDY_PLAN_REVIEW_DAY_MAX_QUESTIONS = 30;
export const STUDY_PLAN_TEST_MIN_QUESTIONS = 5;
export const STUDY_PLAN_TEST_MAX_QUESTIONS = 40;

/**
 * Upper bound on steps in one day, for validating saved progress. A 7-day
 * plan of a big category has ~14 lessons + review + day exam + mock + extra.
 */
export const STUDY_PLAN_MAX_STEPS_PER_DAY = 40;

/**
 * Bounds of a day's mistake list in saved progress (question ids answered
 * wrong that day, still to fix): a 7-day plan's biggest day has ~14 lessons.
 */
export const STUDY_PLAN_DAY_MISTAKES_MAX = 300;
/** All days together (a bank has ~1k tickets; keeps the progress row small). */
export const STUDY_PLAN_MISTAKES_TOTAL_MAX = 1000;
export const STUDY_PLAN_QUESTION_ID_MAX = 1_000_000;

/**
 * How long the per-category question id list (and the schedules built from
 * it) is cached in memory.
 */
export const STUDY_PLAN_QUESTION_CACHE_MS = 10 * 60 * 1000;

/**
 * Built schedules kept per category question list (oldest dropped first).
 * The presets plus the common exam-date lengths fit; a schedule is ~30 KB.
 */
export const STUDY_PLAN_SCHEDULE_CACHE_MAX = 32;

/** Time estimates for minutes per day (seconds per question). */
export const STUDY_PLAN_SECONDS_LEARN = 35;
export const STUDY_PLAN_SECONDS_QUIZ = 20;
export const STUDY_PLAN_SECONDS_EXAM = 30;
/** Reading one lesson card (sign / rule) and its explanation. */
export const STUDY_PLAN_SECONDS_CARD = 30;

/**
 * Subject ids in teaching order (prava `src/data/subjects.json`): signs first
 * (warning → priority → prohibitory → mandatory → information → service →
 * additional), then markings, traffic lights, controller, then the rules.
 * Subjects missing from this list go last, by id.
 */
export const SUBJECT_TEACHING_ORDER: readonly number[] = [
  3, 4, 5, 6, 7, 8, 9, 28, 10, 11, 1, 2, 15, 20, 17, 18, 16, 19, 21, 22, 23, 14,
  12, 13, 24, 25, 26, 27, 30, 29, 31, 32,
];
