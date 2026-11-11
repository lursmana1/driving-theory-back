import {
  STUDY_PLAN_INTERLEAVE_WINDOW,
  STUDY_PLAN_MIN_REVIEW_DAYS,
  STUDY_PLAN_MIN_REVIEW_DAYS_FROM_DAYS,
  STUDY_PLAN_MIX_MIN_SUBJECTS,
  STUDY_PLAN_MIX_QUESTIONS,
  STUDY_PLAN_MOCK_EVERY_LEARN_DAYS,
  STUDY_PLAN_REVIEW_DAY_MAX_QUESTIONS,
  STUDY_PLAN_REVIEW_MAX_QUESTIONS,
  STUDY_PLAN_REVIEW_SHARE,
  STUDY_PLAN_SECONDS_CARD,
  STUDY_PLAN_SECONDS_EXAM,
  STUDY_PLAN_SECONDS_LEARN,
  STUDY_PLAN_SECONDS_QUIZ,
  STUDY_PLAN_TEST_MAX_QUESTIONS,
  STUDY_PLAN_TEST_MIN_QUESTIONS,
} from '../../common/constants/study-plan.constants.js';
import type {
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
import { addStudyDays } from './plan-length.util.js';

/** Days at the end with no new lessons (review + full mocks). */
export function reviewDayCount(dayCount: number): number {
  const share = Math.round(dayCount * STUDY_PLAN_REVIEW_SHARE);
  const min =
    dayCount >= STUDY_PLAN_MIN_REVIEW_DAYS_FROM_DAYS
      ? STUDY_PLAN_MIN_REVIEW_DAYS
      : 1;
  return Math.min(dayCount - 1, Math.max(min, share));
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

function stepSeconds(step: PlanStep): number {
  if (step.kind === 'learn') {
    return (
      step.questionCount * STUDY_PLAN_SECONDS_LEARN +
      (step.cardCount ?? 0) * STUDY_PLAN_SECONDS_CARD
    );
  }
  if (step.kind === 'exam') return step.questionCount * STUDY_PLAN_SECONDS_EXAM;
  return step.questionCount * STUDY_PLAN_SECONDS_QUIZ;
}

/** Estimated learn time of a lesson: its cards and tickets. */
function lessonSeconds(lesson: PlanLesson): number {
  return (
    lesson.questionIds.length * STUDY_PLAN_SECONDS_LEARN +
    lesson.cardIds.length * STUDY_PLAN_SECONDS_CARD
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
): PlanLesson[][] {
  const out = splitByWeight(lessons, days, lessonSeconds);
  if (out.every((d) => d.length > 0)) return out;
  return out.map((_, i) =>
    lessons.slice(
      Math.floor((i * lessons.length) / days),
      Math.floor(((i + 1) * lessons.length) / days),
    ),
  );
}

function learnDaySteps(
  lessons: PlanLesson[],
  learnIndex: number,
  examQuestionCount: number,
): PlanStep[] {
  const newQuestions = lessons.reduce((n, l) => n + l.questionIds.length, 0);
  const subjectCount = new Set(lessons.map((l) => l.subjectId)).size;
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
  if (subjectCount >= STUDY_PLAN_MIX_MIN_SUBJECTS) {
    steps.push({
      kind: 'mix',
      questionCount: Math.min(STUDY_PLAN_MIX_QUESTIONS, newQuestions),
    });
  }
  if (newQuestions >= STUDY_PLAN_TEST_MIN_QUESTIONS) {
    steps.push({
      kind: 'test',
      questionCount: Math.min(STUDY_PLAN_TEST_MAX_QUESTIONS, newQuestions),
    });
  }
  if ((learnIndex + 1) % STUDY_PLAN_MOCK_EVERY_LEARN_DAYS === 0) {
    steps.push({ kind: 'exam', questionCount: examQuestionCount });
  }
  return steps;
}

/**
 * Pure: questions of a category → lessons → days. The last ~15% of days
 * hold no new lessons (review + a full mock each); a mock also comes every
 * 3rd learn day. When there are fewer lessons than learn days, the extra
 * days become review days.
 */
export function buildSchedule(input: ScheduleInput): PlanSchedule {
  const { subjects, dayCount, startDay, examQuestionCount } = input;
  const totalQuestions = subjects.reduce(
    (n, s) => n + new Set(s.questionIds).size,
    0,
  );
  // Lesson weight: tickets, and cards with no ticket here (they still teach).
  const totalWeight = subjects.reduce((n, s) => n + subjectWeight(s), 0);
  const plannedLearnDays = dayCount - reviewDayCount(dayCount);
  const lessonSize = lessonSizeFor(Math.ceil(totalWeight / plannedLearnDays));
  const lessons = interleaveLessons(buildLessons(subjects, lessonSize));
  const learnDays = Math.min(plannedLearnDays, lessons.length);

  const lessonsByDay = splitLessonsByTime(lessons, learnDays);

  const days: PlanDay[] = [];
  for (let index = 0; index < dayCount; index++) {
    const date = addStudyDays(startDay, index);
    if (index < learnDays) {
      const dayLessons = lessonsByDay[index];
      const steps = learnDaySteps(dayLessons, index, examQuestionCount);
      days.push({
        index,
        date,
        kind: 'learn',
        lessons: dayLessons,
        newQuestions: dayLessons.reduce((n, l) => n + l.questionIds.length, 0),
        steps,
        minutes: 0,
      });
    } else {
      days.push({
        index,
        date,
        kind: 'review',
        lessons: [],
        newQuestions: 0,
        steps: [
          {
            kind: 'review',
            questionCount: STUDY_PLAN_REVIEW_DAY_MAX_QUESTIONS,
          },
          { kind: 'exam', questionCount: examQuestionCount },
        ],
        minutes: 0,
      });
    }
  }
  for (const day of days) {
    const seconds = day.steps.reduce((n, step) => n + stepSeconds(step), 0);
    day.minutes = Math.ceil(seconds / 60);
  }

  const minutes = days.map((d) => d.minutes);
  return {
    dayCount,
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
