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

/** Share of the plan's last days that hold no new lessons (review + mocks). */
export const STUDY_PLAN_REVIEW_SHARE = 0.15;

/** Minimum review days once a plan is at least `..._FROM_DAYS` long. */
export const STUDY_PLAN_MIN_REVIEW_DAYS = 2;
export const STUDY_PLAN_MIN_REVIEW_DAYS_FROM_DAYS = 7;

/** Lesson size bounds (questions of one subject). */
export const STUDY_PLAN_LESSON_MIN = 6;
export const STUDY_PLAN_LESSON_MAX = 14;

/** Target lessons per learn day; lesson size = new questions per day / this. */
export const STUDY_PLAN_LESSONS_PER_DAY_TARGET = 4;

/** How many neighbouring subjects are interleaved at once. */
export const STUDY_PLAN_INTERLEAVE_WINDOW = 3;

/** Every n-th learn day also gets a full mock exam. */
export const STUDY_PLAN_MOCK_EVERY_LEARN_DAYS = 3;

/** Step sizes (questions). */
export const STUDY_PLAN_MIX_QUESTIONS = 10;
export const STUDY_PLAN_MIX_MIN_SUBJECTS = 2;
export const STUDY_PLAN_REVIEW_MAX_QUESTIONS = 12;
/** Review days (no new lessons) get a bigger review step. */
export const STUDY_PLAN_REVIEW_DAY_MAX_QUESTIONS = 30;
export const STUDY_PLAN_TEST_MIN_QUESTIONS = 5;
export const STUDY_PLAN_TEST_MAX_QUESTIONS = 30;

/**
 * Upper bound on steps in one day, for validating saved progress. A 7-day
 * plan of a big category has ~14 lessons + review + mix + test + exam.
 */
export const STUDY_PLAN_MAX_STEPS_PER_DAY = 40;

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
