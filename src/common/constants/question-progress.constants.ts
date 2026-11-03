/**
 * Calendar for study features (mistake trainer, study plan). Same zone as the
 * login streak: Georgia, UTC+4, no DST.
 */
export const STUDY_TIME_ZONE = 'Asia/Tbilisi';

/**
 * A study day starts at 04:00 Tbilisi time, not midnight, so a late-night
 * session (23:30 → 01:30) counts as one day. Shared by the login streak,
 * mistake-review due times and the study plan (`common/sql/study-day.sql.ts`).
 * Tbilisi has no DST, so this is exactly 00:00 UTC.
 */
export const STUDY_DAY_START_HOUR = 4;

/**
 * Days until the next review after each correct due review of a mistake.
 * A wrong answer makes the question due at once; after the 1st, 2nd and 3rd
 * correct review it comes back in 1, 3 and 7 days (the last step repeats).
 * Changing this only affects reviews scheduled afterwards.
 */
export const MISTAKE_REVIEW_INTERVAL_DAYS: readonly number[] = [1, 3, 7];

/**
 * Most correct due reviews a mistake can need. A wrong answer sets
 * `reviewsLeft = MAX − correctCount + wrongCount` (this answer included),
 * kept within 1..MAX: a question with a good record needs fewer reviews.
 */
export const MISTAKE_MAX_REVIEWS = 3;

/** Default and maximum questions per GET /trainer/session batch. */
export const TRAINER_SESSION_DEFAULT_LIMIT = 20;
export const TRAINER_SESSION_MAX_LIMIT = 50;

/** Max subject ids accepted in one trainer filter. */
export const TRAINER_MAX_SUBJECT_FILTER = 50;

/** Window for "cleared recently" in the trainer summary. */
export const TRAINER_CLEARED_WINDOW_DAYS = 7;
