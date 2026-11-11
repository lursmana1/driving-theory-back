import {
  STUDY_PLAN_LESSON_MAX,
  STUDY_PLAN_LESSON_MIN,
  STUDY_PLAN_LESSONS_PER_DAY_TARGET,
  STUDY_PLAN_DEPTH_FULL,
  SUBJECT_TEACHING_ORDER,
  type PlanDepth,
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

/** Tickets taught in the lesson: a card's first few, a lone ticket itself. */
function taughtIds(unit: LessonUnit, depth: PlanDepth): readonly number[] {
  return unit.cardId
    ? unit.questionIds.slice(0, depth.ticketsPerCard)
    : unit.questionIds;
}

/** A card's tickets beyond the taught ones. */
function restIdsOf(unit: LessonUnit, depth: PlanDepth): readonly number[] {
  return unit.cardId ? unit.questionIds.slice(depth.ticketsPerCard) : [];
}

/** Lesson size cost of a unit: its taught tickets, and at least 1 (a card alone). */
export function unitWeight(
  unit: LessonUnit,
  depth: PlanDepth = STUDY_PLAN_DEPTH_FULL,
): number {
  return Math.max(1, taughtIds(unit, depth).length);
}

/** Whether a unit is taught at this depth (short plans skip ticketless cards). */
function isTaught(unit: LessonUnit, depth: PlanDepth): boolean {
  if (unit.questionIds.length > 0) return true;
  return unit.cardId != null && depth.teachingOnlyCards;
}

/**
 * Subjects with something to teach, in teaching order. Card subjects keep
 * their unit order; others become one unit per ticket, ids ascending.
 * A ticket appears once (first unit wins).
 */
export function orderSubjects(
  subjects: readonly SubjectQuestions[],
  depth: PlanDepth = STUDY_PLAN_DEPTH_FULL,
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
        // A card with no tickets teaches only in full plans; an empty ticket
        // unit is always dropped.
        units: units.filter((u) => isTaught(u, depth)),
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

/** Lesson weight of a subject: the sum of its taught units' weights. */
export function subjectWeight(
  subject: SubjectQuestions,
  depth: PlanDepth = STUDY_PLAN_DEPTH_FULL,
): number {
  return subject.units
    ? subject.units
        .filter((u) => isTaught(u, depth))
        .reduce((n, u) => n + unitWeight(u, depth), 0)
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
  depth: PlanDepth = STUDY_PLAN_DEPTH_FULL,
): PlanLesson[][] {
  const weightOf = (u: LessonUnit) => unitWeight(u, depth);
  return orderSubjects(subjects, depth).map(({ subjectId, units }) => {
    const weight = units.reduce((n, u) => n + weightOf(u), 0);
    const chunks = splitByWeight(
      units,
      Math.ceil(weight / lessonSize),
      weightOf,
    ).filter((c) => c.length > 0);
    return chunks.map((chunk, i) => ({
      id: `${subjectId}-${i + 1}`,
      subjectId,
      part: i + 1,
      parts: chunks.length,
      questionIds: chunk.flatMap((u) => taughtIds(u, depth)),
      restIds: chunk.flatMap((u) => restIdsOf(u, depth)),
      cardIds: chunk.flatMap((u) => (u.cardId ? [u.cardId] : [])),
    }));
  });
}
