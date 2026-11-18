import {
  STUDY_PLAN_DAY_MISTAKES_MAX,
  STUDY_PLAN_MAX_DAYS,
  STUDY_PLAN_MISTAKES_TOTAL_MAX,
  STUDY_PLAN_QUESTION_ID_MAX,
  STUDY_PLAN_MAX_STEPS_PER_DAY,
  STUDY_PLAN_TEST_MAX_QUESTIONS,
} from '../common/constants/study-plan.constants.js';
import { isStudyDay } from './schedule/plan-length.util.js';
import type { DayTestResult, StudyPlanProgress } from './study-plans.types.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Canonical index ("0", "12"; not "012"), so one index has one key. */
function isIndexKey(key: string, max: number): boolean {
  return /^(0|[1-9]\d{0,2})$/.test(key) && Number(key) < max;
}

function isIntIn(value: unknown, min: number, max: number): value is number {
  return (
    Number.isInteger(value) && Number(value) >= min && Number(value) <= max
  );
}

function isTestResult(value: unknown): value is DayTestResult {
  if (!isPlainObject(value)) return false;
  const { correct, total, passed } = value;
  return (
    typeof passed === 'boolean' &&
    isIntIn(total, 0, STUDY_PLAN_TEST_MAX_QUESTIONS) &&
    isIntIn(correct, 0, total)
  );
}

/**
 * Validates client-sent plan progress and returns a clean copy (only the
 * known fields). Null when anything is out of shape: day keys 0..dayCount−1,
 * step keys 0..MAX_STEPS−1, done values real `YYYY-MM-DD` days, test scores
 * within the test size, mistakes = bounded lists of question ids. Bounded,
 * so a row stays small.
 */
export function parsePlanProgress(
  input: { done: unknown; tests: unknown; mistakes?: unknown },
  dayCount: number,
): StudyPlanProgress | null {
  const maxDays = Math.min(dayCount, STUDY_PLAN_MAX_DAYS);
  if (!isPlainObject(input.done) || !isPlainObject(input.tests)) return null;
  // Optional: clients before the mistakes list send none, and since a save
  // replaces the whole plan, such a save stores no mistakes.
  const mistakesIn = input.mistakes ?? {};
  if (!isPlainObject(mistakesIn)) return null;

  const done: StudyPlanProgress['done'] = {};
  for (const [day, steps] of Object.entries(input.done)) {
    if (!isIndexKey(day, maxDays) || !isPlainObject(steps)) return null;
    const clean: Record<string, string> = {};
    for (const [step, on] of Object.entries(steps)) {
      if (!isIndexKey(step, STUDY_PLAN_MAX_STEPS_PER_DAY)) return null;
      if (typeof on !== 'string' || !isStudyDay(on)) return null;
      clean[step] = on;
    }
    done[day] = clean;
  }

  const tests: StudyPlanProgress['tests'] = {};
  for (const [day, result] of Object.entries(input.tests)) {
    if (!isIndexKey(day, maxDays) || !isTestResult(result)) return null;
    tests[day] = {
      correct: result.correct,
      total: result.total,
      passed: result.passed,
    };
  }

  const mistakes: StudyPlanProgress['mistakes'] = {};
  let mistakeCount = 0;
  for (const [day, ids] of Object.entries(mistakesIn)) {
    if (!isIndexKey(day, maxDays) || !Array.isArray(ids)) return null;
    if (ids.length > STUDY_PLAN_DAY_MISTAKES_MAX) return null;
    if (!ids.every((id) => isIntIn(id, 1, STUDY_PLAN_QUESTION_ID_MAX))) {
      return null;
    }
    mistakeCount += ids.length;
    if (mistakeCount > STUDY_PLAN_MISTAKES_TOTAL_MAX) return null;
    if (ids.length > 0) mistakes[day] = [...new Set(ids)];
  }
  return { done, tests, mistakes };
}
