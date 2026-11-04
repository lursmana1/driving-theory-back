import {
  STUDY_PLAN_LESSON_MAX,
  STUDY_PLAN_LESSON_MIN,
  STUDY_PLAN_LESSONS_PER_DAY_TARGET,
  SUBJECT_TEACHING_ORDER,
} from '../../common/constants/study-plan.constants.js';
import type { PlanLesson, SubjectQuestions } from '../study-plans.types.js';

const TEACHING_RANK = new Map(SUBJECT_TEACHING_ORDER.map((id, i) => [id, i]));

/** Position of a subject in the teaching order; unknown subjects go last. */
function teachingRank(subjectId: number): number {
  return (
    TEACHING_RANK.get(subjectId) ?? SUBJECT_TEACHING_ORDER.length + subjectId
  );
}

/** Subjects with questions, in teaching order, question ids ascending. */
export function orderSubjects(
  subjects: readonly SubjectQuestions[],
): { subjectId: number; questionIds: number[] }[] {
  return subjects
    .filter((s) => s.questionIds.length > 0)
    .map((s) => ({
      subjectId: s.subjectId,
      questionIds: [...new Set(s.questionIds)].sort((a, b) => a - b),
    }))
    .sort((a, b) => teachingRank(a.subjectId) - teachingRank(b.subjectId));
}

/** Questions per lesson for this many new questions per learn day. */
export function lessonSizeFor(questionsPerLearnDay: number): number {
  const size = Math.ceil(
    questionsPerLearnDay / STUDY_PLAN_LESSONS_PER_DAY_TARGET,
  );
  return Math.min(STUDY_PLAN_LESSON_MAX, Math.max(STUDY_PLAN_LESSON_MIN, size));
}

/**
 * Cuts `ids` into `parts` lessons whose sizes differ by at most one, so a
 * subject never ends on a 1-question lesson.
 */
function splitEvenly(ids: number[], parts: number): number[][] {
  const base = Math.floor(ids.length / parts);
  const extra = ids.length % parts;
  const chunks: number[][] = [];
  let start = 0;
  for (let i = 0; i < parts; i++) {
    const size = base + (i < extra ? 1 : 0);
    chunks.push(ids.slice(start, start + size));
    start += size;
  }
  return chunks;
}

/**
 * Lessons of one subject each, in teaching order. Lesson id is
 * `<subjectId>-<part>` (1-based), stable for the same input.
 */
export function buildLessons(
  subjects: readonly SubjectQuestions[],
  lessonSize: number,
): PlanLesson[][] {
  return orderSubjects(subjects).map(({ subjectId, questionIds }) => {
    const parts = Math.ceil(questionIds.length / lessonSize);
    return splitEvenly(questionIds, parts).map((ids, i) => ({
      id: `${subjectId}-${i + 1}`,
      subjectId,
      part: i + 1,
      parts,
      questionIds: ids,
    }));
  });
}
