import {
  STUDY_PLAN_LESSON_MAX,
  STUDY_PLAN_LESSON_MIN,
  STUDY_PLAN_LESSONS_PER_DAY_TARGET,
  SUBJECT_TEACHING_ORDER,
} from '../../common/constants/study-plan.constants.js';
import type {
  LessonUnit,
  PlanLesson,
  SubjectQuestions,
} from '../study-plans.types.js';

const TEACHING_RANK = new Map(SUBJECT_TEACHING_ORDER.map((id, i) => [id, i]));

/** Position of a subject in the teaching order; unknown subjects go last. */
function teachingRank(subjectId: number): number {
  return (
    TEACHING_RANK.get(subjectId) ?? SUBJECT_TEACHING_ORDER.length + subjectId
  );
}

/** A subject ready to cut into lessons: its units in teaching order. */
type OrderedSubject = { subjectId: number; units: LessonUnit[] };

/** Lesson size cost of a unit: its tickets, and at least 1 (a card alone). */
export function unitWeight(unit: LessonUnit): number {
  return Math.max(1, unit.questionIds.length);
}

/**
 * Subjects with something to teach, in teaching order. Card subjects keep
 * their unit order; others become one unit per ticket, ids ascending.
 * A ticket appears once (first unit wins).
 */
export function orderSubjects(
  subjects: readonly SubjectQuestions[],
): OrderedSubject[] {
  return subjects
    .map((s) => {
      const seen = new Set<number>();
      const fresh = (ids: readonly number[]) =>
        ids.filter((id) => !seen.has(id) && seen.add(id));
      const units: LessonUnit[] = s.units
        ? s.units.map((u) => ({
            cardId: u.cardId,
            questionIds: fresh(u.questionIds),
          }))
        : fresh([...s.questionIds].sort((a, b) => a - b)).map((id) => ({
            cardId: null,
            questionIds: [id],
          }));
      return {
        subjectId: s.subjectId,
        // A card with no tickets still teaches; an empty ticket unit is dropped.
        units: units.filter((u) => u.cardId != null || u.questionIds.length),
      };
    })
    .filter((s) => s.units.length > 0)
    .sort((a, b) => teachingRank(a.subjectId) - teachingRank(b.subjectId));
}

/** Questions per lesson for this many new questions per learn day. */
export function lessonSizeFor(questionsPerLearnDay: number): number {
  const size = Math.ceil(
    questionsPerLearnDay / STUDY_PLAN_LESSONS_PER_DAY_TARGET,
  );
  return Math.min(STUDY_PLAN_LESSON_MAX, Math.max(STUDY_PLAN_LESSON_MIN, size));
}

/** Lesson weight of a subject: the sum of its units' weights. */
export function subjectWeight(subject: SubjectQuestions): number {
  return subject.units
    ? subject.units.reduce((n, u) => n + unitWeight(u), 0)
    : new Set(subject.questionIds).size;
}

/**
 * Cuts ordered `items` into `parts` runs of near-equal weight, never inside
 * an item: each item goes to the part its weight midpoint falls in, so cuts
 * land on the boundaries closest to the even split. A part may come out
 * empty when one item outweighs a whole part.
 */
export function splitByWeight<T>(
  items: readonly T[],
  parts: number,
  weightOf: (item: T) => number,
): T[][] {
  const weights = items.map(weightOf);
  const total = Math.max(
    1,
    weights.reduce((a, b) => a + b, 0),
  );
  const out: T[][] = Array.from({ length: parts }, () => []);
  let before = 0;
  items.forEach((item, i) => {
    const part = Math.min(
      parts - 1,
      Math.floor(((before + weights[i] / 2) * parts) / total),
    );
    out[part].push(item);
    before += weights[i];
  });
  return out;
}

/**
 * Lessons of one subject each, in teaching order. Lesson id is
 * `<subjectId>-<part>` (1-based), stable for the same input.
 */
export function buildLessons(
  subjects: readonly SubjectQuestions[],
  lessonSize: number,
): PlanLesson[][] {
  return orderSubjects(subjects).map(({ subjectId, units }) => {
    const weight = units.reduce((n, u) => n + unitWeight(u), 0);
    const chunks = splitByWeight(
      units,
      Math.ceil(weight / lessonSize),
      unitWeight,
    ).filter((c) => c.length > 0);
    return chunks.map((chunk, i) => ({
      id: `${subjectId}-${i + 1}`,
      subjectId,
      part: i + 1,
      parts: chunks.length,
      questionIds: chunk.flatMap((u) => u.questionIds),
      cardIds: chunk.flatMap((u) => (u.cardId ? [u.cardId] : [])),
    }));
  });
}
