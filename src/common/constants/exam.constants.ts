/** Minimum wrong answers before using personalized (weak-area) selection. @deprecated Use MIN_ANSWERS_FOR_PERSONALIZATION */
export const MIN_WRONG_ANSWERS_FOR_STATS = 50;

/** Minimum total answers before any personalization (100–499: mainly random; 500+: full). */
export const MIN_ANSWERS_FOR_PERSONALIZATION = 100;

/** Minimum answers for full personalization (50/40/10). Below this, use mainly-random ratios. */
export const MIN_ANSWERS_FOR_FULL_PERSONALIZATION = 500;

/** Default question count per exam. */
export const DEFAULT_QUESTION_COUNT = 30;

/** Exam duration in minutes. */
export const EXAM_DURATION_MINUTES = 30;

/** Minimum fraction of correct answers to pass (0.9 = 90%). */
export const EXAM_PASS_PERCENT = 0.9;

/** Max history entries to load for weakness computation. */
export const MAX_HISTORY_FOR_WEIGHTING = 500;

/** Max IDs per bucket to keep $in/$nin fast in MongoDB. */
export const MAX_WEAKNESS_IDS_CAP = 100;

/** Max candidates to sample before weighting (for personalized selection). */
export const MAX_CANDIDATE_SAMPLE_SIZE = 200;

/** Max raw answers to return in stats. */
export const MAX_STATS_LIMIT = 1000;

/** Minimum per-subject attempts (correct + wrong) before weak-subject ranking is reliable. */
export const MIN_SUBJECT_ATTEMPTS_FOR_STATS = 10;

/** Max page size for history. */
export const MAX_HISTORY_PAGE_SIZE = 50;

/** Default page size for history. */
export const DEFAULT_HISTORY_PAGE_SIZE = 10;
