import {
  STUDY_PLAN_INTERLEAVE_WINDOW,
  STUDY_PLAN_DAY_EXAM_MIN_TODAY,
  STUDY_PLAN_DAY_EXAM_OLDER,
  STUDY_PLAN_DAY_EXAM_SHARE,
  STUDY_PLAN_MAX_DAYS,
  STUDY_PLAN_MIN_DAYS,
  STUDY_PLAN_MOCK_EVERY_LEARN_DAYS,
  STUDY_PLAN_REVIEW_DAY_MAX_QUESTIONS,
  STUDY_PLAN_REVIEW_DAY_MOCKS,
  STUDY_PLAN_REVIEW_MAX_QUESTIONS,
  STUDY_PLAN_REVIEW_DAYS_BY_LENGTH,
  STUDY_PLAN_DEPTH_FULL,
  STUDY_PLAN_DEPTH_SHORT,
  STUDY_PLAN_SHORT_MAX_DAYS,
  STUDY_PLAN_SECONDS_CARD,
  STUDY_PLAN_SECONDS_EXAM,
  STUDY_PLAN_SECONDS_LEARN,
  STUDY_PLAN_SECONDS_QUIZ,
  STUDY_PLAN_TEST_MAX_QUESTIONS,
  STUDY_PLAN_TEST_MIN_QUESTIONS,
  type PlanDepth,
} from '../../common/constants/study-plan.constants.js';
import type {
  DayExamParts,
  SubjectQuestions,
  PlanDay,
  PlanLesson,
  PlanSchedule,
  PlanStep,
  ScheduleInput,
} from '../study-plans.types.js';
import {
  buildLessons,
  lessonSizeFor,
  splitByWeight,
  subjectWeight,
} from './lesson.builder.util.js';
import { metIds } from './day-session.util.js';
import { addStudyDays } from './plan-length.util.js';

/** Full plans cover every ticket; short ones teach the essentials. */
export function planDepthFor(dayCount: number): PlanDepth {
  return dayCount <= STUDY_PLAN_SHORT_MAX_DAYS
    ? STUDY_PLAN_DEPTH_SHORT
    : STUDY_PLAN_DEPTH_FULL;
}

/** Days at the end with no new lessons (review + full mocks). */
export function reviewDayCount(dayCount: number): number {
  // The last entry starts at 0, so every length matches one.
  const [, review] = STUDY_PLAN_REVIEW_DAYS_BY_LENGTH.find(
    ([from]) => dayCount >= from,
  )!;
  return Math.min(dayCount - 1, review);
}

/**
 * Round-robin over a window of neighbouring subjects: a day mixes 2–3
 * topics, and a finished subject hands its slot to the next in order.
 */
export function interleaveLessons(bySubject: PlanLesson[][]): PlanLesson[] {
  const queues = bySubject.map((lessons) => [...lessons]);
  const window = queues.splice(0, STUDY_PLAN_INTERLEAVE_WINDOW);
  const out: PlanLesson[] = [];
  let turn = 0;
  while (window.length > 0) {
    const i = turn % window.length;
    const lesson = window[i].shift();
    if (lesson) out.push(lesson);
    if (window[i].length === 0) {
      window.splice(i, 1);
      const next = queues.shift();
      if (next) window.push(next);
    } else {
      turn++;
    }
  }
  return out;
}

/** Required time of a step; the optional `extra` round is not counted. */
function stepSeconds(step: PlanStep): number {
  if (step.kind === 'extra') return 0;
  if (step.kind === 'learn') {
    return (
      step.questionCount * STUDY_PLAN_SECONDS_LEARN +
      (step.cardCount ?? 0) * STUDY_PLAN_SECONDS_CARD
    );
  }
  if (step.kind === 'exam' || step.kind === 'test') {
    return step.questionCount * STUDY_PLAN_SECONDS_EXAM;
  }
  return step.questionCount * STUDY_PLAN_SECONDS_QUIZ;
}

/**
 * Required time a lesson costs: cards, taught tickets, and (full plans) its
 * other tickets in the next day's exam. Short plans' optional ones don't count.
 */
function lessonSeconds(lesson: PlanLesson, restInPlan: boolean): number {
  return (
    lesson.questionIds.length * STUDY_PLAN_SECONDS_LEARN +
    lesson.cardIds.length * STUDY_PLAN_SECONDS_CARD +
    (restInPlan ? lesson.restIds.length * STUDY_PLAN_SECONDS_EXAM : 0)
  );
}

/**
 * Cuts the ordered lessons into `days` runs of near-equal learn time (a
 * lesson goes to the day its time midpoint falls in), so card-heavy sign
 * lessons spread over more days. Every day gets at least one lesson
 * (needs `lessons.length >= days`); if time-splitting would leave a day
 * empty, falls back to an even split by lesson count.
 */
export function splitLessonsByTime(
  lessons: PlanLesson[],
  days: number,
  restInPlan = true,
): PlanLesson[][] {
  const out = splitByWeight(lessons, days, (l) => lessonSeconds(l, restInPlan));
  if (out.every((d) => d.length > 0)) return out;
  return out.map((_, i) =>
    lessons.slice(
      Math.floor((i * lessons.length) / days),
      Math.floor(((i + 1) * lessons.length) / days),
    ),
  );
}

/**
 * The mixed day exam: all of yesterday's extra tickets, a few older ones, and
 * enough of today's to reach the target size (at least a handful), capped.
 */
export function dayExamParts(
  carryCount: number,
  newQuestions: number,
  olderAvailable: number,
  examQuestionCount: number,
): DayExamParts {
  const target = Math.round(examQuestionCount * STUDY_PLAN_DAY_EXAM_SHARE);
  const carry = Math.min(carryCount, STUDY_PLAN_TEST_MAX_QUESTIONS);
  const older = Math.min(
    olderAvailable,
    STUDY_PLAN_DAY_EXAM_OLDER,
    STUDY_PLAN_TEST_MAX_QUESTIONS - carry,
  );
  const today = Math.min(
    newQuestions,
    STUDY_PLAN_TEST_MAX_QUESTIONS - carry - older,
    Math.max(target - carry - older, STUDY_PLAN_DAY_EXAM_MIN_TODAY),
  );
  return { carry, today, older };
}

type LearnDayInput = {
  lessons: PlanLesson[];
  learnIndex: number;
  newQuestions: number;
  examQuestionCount: number;
  carryCount: number;
  olderAvailable: number;
  optionalCount: number;
};

function learnDaySteps({
  lessons,
  learnIndex,
  newQuestions,
  examQuestionCount,
  carryCount,
  olderAvailable,
  optionalCount,
}: LearnDayInput): PlanStep[] {
  const steps: PlanStep[] = lessons.map((lesson) => ({
    kind: 'learn',
    lessonId: lesson.id,
    questionCount: lesson.questionIds.length,
    ...(lesson.cardIds.length ? { cardCount: lesson.cardIds.length } : {}),
  }));
  if (learnIndex > 0) {
    steps.push({
      kind: 'review',
      questionCount: STUDY_PLAN_REVIEW_MAX_QUESTIONS,
    });
  }
  const parts = dayExamParts(
    carryCount,
    newQuestions,
    olderAvailable,
    examQuestionCount,
  );
  const questionCount = parts.carry + parts.today + parts.older;
  if (questionCount >= STUDY_PLAN_TEST_MIN_QUESTIONS) {
    steps.push({ kind: 'test', questionCount, examParts: parts });
  }
  if ((learnIndex + 1) % STUDY_PLAN_MOCK_EVERY_LEARN_DAYS === 0) {
    steps.push({ kind: 'exam', questionCount: examQuestionCount });
  }
  // Short plans: optional remaining tickets, after everything else.
  if (optionalCount > 0) {
    steps.push({ kind: 'extra', questionCount: optionalCount });
  }
  return steps;
}

/**
 * Spreads the optional tickets evenly over the learn days and the review
 * days after them (`reviewDays`), in teaching order, never before the day
 * their card is taught: each day takes its fair share of what is left, from
 * the tickets already unlocked.
 */
export function spreadOptional(
  lessonsByDay: PlanLesson[][],
  reviewDays = 0,
): number[][] {
  const days = [
    ...lessonsByDay,
    ...Array.from({ length: reviewDays }, (): PlanLesson[] => []),
  ];
  const queue: number[] = [];
  let remaining = lessonsByDay.reduce(
    (n, day) => n + day.reduce((m, l) => m + l.restIds.length, 0),
    0,
  );
  return days.map((day, d) => {
    for (const lesson of day) queue.push(...lesson.restIds);
    const share = Math.ceil(remaining / (days.length - d));
    const taken = queue.splice(0, Math.min(share, queue.length));
    remaining -= taken.length;
    return taken;
  });
}

/**
 * Pure: questions of a category → lessons → days. Learn days: lessons
 * (a card + its first tickets), the mistakes review, and a mixed day exam
 * (yesterday's extra tickets, today's, a few older ones) that closes the
 * day; the full mock every 3rd learn day; in short plans an optional round
 * of the day's remaining tickets. The last 1–3 days hold no new
 * lessons: the last extras, the mistakes review and two full mocks. When
 * there are fewer lessons than learn days, the extra days become review days.
 */
export function buildSchedule(input: ScheduleInput): PlanSchedule {
  const { subjects, dayCount, startDay, examQuestionCount } = input;
  const totalQuestions = subjects.reduce(
    (n, s) => n + new Set(s.questionIds).size,
    0,
  );
  const depth = planDepthFor(dayCount);
  // Lesson weight: taught tickets, and (full plans) cards with no ticket here.
  const totalWeight = subjects.reduce((n, s) => n + subjectWeight(s, depth), 0);
  const plannedLearnDays = dayCount - reviewDayCount(dayCount);
  const lessonSize = lessonSizeFor(Math.ceil(totalWeight / plannedLearnDays));
  const lessons = interleaveLessons(buildLessons(subjects, lessonSize, depth));
  const learnDays = Math.min(plannedLearnDays, lessons.length);

  const lessonsByDay = splitLessonsByTime(
    lessons,
    learnDays,
    depth.extrasInPlan,
  );
  // Short plans: a card's other tickets go to the optional rounds.
  const optionalByDay = depth.extrasInPlan
    ? Array.from({ length: dayCount }, (): number[] => [])
    : spreadOptional(lessonsByDay, dayCount - learnDays);

  const days: PlanDay[] = [];
  let carryIds: number[] = [];
  /** Tickets met before today: the day exam's "older" pool (`olderQuestionIds`). */
  let metBefore = 0;
  for (let index = 0; index < dayCount; index++) {
    const date = addStudyDays(startDay, index);
    if (index < learnDays) {
      const dayLessons = lessonsByDay[index];
      const newQuestions = dayLessons.reduce(
        (n, l) => n + l.questionIds.length,
        0,
      );
      days.push({
        index,
        date,
        kind: 'learn',
        lessons: dayLessons,
        carryIds,
        optionalIds: optionalByDay[index],
        newQuestions,
        steps: learnDaySteps({
          lessons: dayLessons,
          learnIndex: index,
          newQuestions,
          examQuestionCount,
          carryCount: carryIds.length,
          olderAvailable: metBefore,
          optionalCount: optionalByDay[index].length,
        }),
        minutes: 0,
      });
      metBefore += metIds(days[index]).length;
      carryIds = depth.extrasInPlan ? dayLessons.flatMap((l) => l.restIds) : [];
    } else {
      const steps: PlanStep[] = [];
      if (carryIds.length > 0) {
        steps.push({ kind: 'mix', questionCount: carryIds.length });
      }
      steps.push({
        kind: 'review',
        questionCount: STUDY_PLAN_REVIEW_DAY_MAX_QUESTIONS,
      });
      for (let m = 0; m < STUDY_PLAN_REVIEW_DAY_MOCKS; m++) {
        steps.push({ kind: 'exam', questionCount: examQuestionCount });
      }
      const optionalIds = optionalByDay[index];
      if (optionalIds.length > 0) {
        steps.push({ kind: 'extra', questionCount: optionalIds.length });
      }
      days.push({
        index,
        date,
        kind: 'review',
        lessons: [],
        carryIds,
        optionalIds: optionalByDay[index],
        newQuestions: 0,
        steps,
        minutes: 0,
      });
      metBefore += metIds(days[index]).length;
      carryIds = [];
    }
  }
  for (const day of days) {
    const seconds = day.steps.reduce((n, step) => n + stepSeconds(step), 0);
    day.minutes = Math.ceil(seconds / 60);
  }

  const minutes = days.map((d) => d.minutes);
  return {
    dayCount,
    mode: depth.mode,
    optionalQuestions: optionalByDay.reduce((n, ids) => n + ids.length, 0),
    learnDays,
    lessonSize,
    totalQuestions,
    minutesPerDayAvg: minutes.length
      ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length)
      : 0,
    minutesPerDayMax: minutes.length ? Math.max(...minutes) : 0,
    days,
  };
}

/**
 * Shortest plan length whose average day fits `targetMinutes` (the picker's
 * "for ~30 min a day, start N days before"); null when even the longest
 * plan doesn't. Minutes don't depend on the start day.
 */
export function daysForTargetMinutes(
  subjects: readonly SubjectQuestions[],
  examQuestionCount: number,
  targetMinutes: number,
): number | null {
  // Average minutes fall as the plan gets longer: binary search (~6 builds).
  const fits = (dayCount: number) =>
    buildSchedule({
      subjects,
      dayCount,
      startDay: '2026-01-01',
      examQuestionCount,
    }).minutesPerDayAvg <= targetMinutes;
  if (!fits(STUDY_PLAN_MAX_DAYS)) return null;
  let lo = STUDY_PLAN_MIN_DAYS;
  let hi = STUDY_PLAN_MAX_DAYS;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
  return null;
}
