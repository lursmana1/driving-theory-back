import type { DaySessionStep, PlanDay } from '../study-plans.types.js';

/**
 * Shuffle seed of one plan day. Unique per (category 0–9, day count ≤ 60,
 * day index < 60). Changing it reshuffles every saved plan's day exam.
 */
export function daySessionSeed(
  categoryId: number,
  dayCount: number,
  index: number,
): number {
  return categoryId * 10_000 + dayCount * 100 + index;
}

/** mulberry32: small deterministic PRNG, same seed → same order. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const random = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Question ids for each step of a day. `learn` keeps lesson order; `test`
 * (the mixed day exam) is yesterday's extra tickets plus a sample of today's
 * new ones and of older ones (`olderIds`), shuffled together; `mix` (review
 * days) is the extra tickets left by the last learn day; `extra` (short
 * plans, optional) is the day's share of the remaining tickets. Stable for the same
 * seed, so a reload shows the same rounds.
 */
export function buildDaySession(
  day: PlanDay,
  seed: number,
  olderIds: readonly number[] = [],
): DaySessionStep[] {
  const dayIds = day.lessons.flatMap((l) => l.questionIds);
  const lessonById = new Map(day.lessons.map((l) => [l.id, l]));
  return day.steps.map((step, i) => {
    const stepSeed = seed * 31 + i;
    let questionIds: number[] = [];
    if (step.kind === 'learn' && step.lessonId) {
      questionIds = lessonById.get(step.lessonId)?.questionIds ?? [];
    } else if (step.kind === 'mix') {
      questionIds = [...day.carryIds];
    } else if (step.kind === 'extra') {
      questionIds = [...day.optionalIds];
    } else if (step.kind === 'test') {
      const parts = step.examParts ?? {
        carry: 0,
        today: step.questionCount,
        older: 0,
      };
      questionIds = seededShuffle(
        [
          ...day.carryIds.slice(0, parts.carry),
          ...seededShuffle(dayIds, stepSeed).slice(0, parts.today),
          ...seededShuffle(olderIds, stepSeed + 1).slice(0, parts.older),
        ],
        stepSeed + 2,
      );
    }
    return {
      kind: step.kind,
      ...(step.lessonId ? { lessonId: step.lessonId } : {}),
      questionIds,
      questionCount: step.questionCount,
      ...(step.cardCount ? { cardCount: step.cardCount } : {}),
    };
  });
}

/** Tickets a day asks for the first time: its carried-over extras and its taught ones. */
export function metIds(day: PlanDay): number[] {
  return [...day.carryIds, ...day.lessons.flatMap((l) => l.questionIds)];
}

/** Tickets met before day `index`: the pool for the day exam's "older" questions. */
export function olderQuestionIds(
  days: readonly PlanDay[],
  index: number,
): number[] {
  return days.slice(0, index).flatMap(metIds);
}
