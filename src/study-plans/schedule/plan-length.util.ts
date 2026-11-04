import { STUDY_DAY_START_HOUR } from '../../common/constants/question-progress.constants.js';
import {
  STUDY_DAY_PATTERN,
  STUDY_PLAN_MAX_DAYS,
  STUDY_PLAN_MIN_DAYS,
} from '../../common/constants/study-plan.constants.js';

/** Tbilisi is UTC+4 all year (no DST). */
const TBILISI_UTC_OFFSET_HOURS = 4;

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDay(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/** Study day `YYYY-MM-DD` that `now` belongs to (starts at 04:00 Tbilisi). */
export function studyDayOf(now: Date): string {
  const shiftMs =
    (TBILISI_UTC_OFFSET_HOURS - STUDY_DAY_START_HOUR) * 60 * 60 * 1000;
  return new Date(now.getTime() + shiftMs).toISOString().slice(0, 10);
}

export function addStudyDays(day: string, days: number): string {
  return new Date(parseDay(day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`). */
export function studyDaysBetween(from: string, to: string): number {
  return Math.round((parseDay(to) - parseDay(from)) / DAY_MS);
}

/** True for a real calendar date written `YYYY-MM-DD`. */
export function isStudyDay(value: string): boolean {
  if (!STUDY_DAY_PATTERN.test(value)) return false;
  const ms = parseDay(value);
  return (
    Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value
  );
}

export type PlanLength =
  | { ok: true; dayCount: number; examDay: string | null }
  | { ok: false; reason: 'too-soon' | 'too-far' };

/**
 * Plan length from an exam date (days before it, the exam day itself not
 * included) or from a preset. The exam date wins when both are given.
 */
export function resolvePlanLength(
  input: { days?: number; examDay?: string },
  today: string,
): PlanLength {
  const dayCount = input.examDay
    ? studyDaysBetween(today, input.examDay)
    : (input.days ?? 0);
  if (dayCount < STUDY_PLAN_MIN_DAYS) return { ok: false, reason: 'too-soon' };
  if (dayCount > STUDY_PLAN_MAX_DAYS) return { ok: false, reason: 'too-far' };
  return { ok: true, dayCount, examDay: input.examDay ?? null };
}
