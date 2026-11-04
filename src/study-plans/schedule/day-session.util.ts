import type { DaySessionStep, PlanDay } from '../study-plans.types.js';

/**
 * Shuffle seed of one plan day. Unique per (category 0–9, day count ≤ 60,
 * day index < 60). Changing it reshuffles every saved plan's mix and test.
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
 * Question ids for each step of a day. `learn` keeps lesson order; `mix`
 * and `test` take a shuffled sample of the day's new questions (stable for
 * the same seed, so a reload shows the same test).
 */
export function buildDaySession(day: PlanDay, seed: number): DaySessionStep[] {
  const dayIds = day.lessons.flatMap((l) => l.questionIds);
  const lessonById = new Map(day.lessons.map((l) => [l.id, l]));
  return day.steps.map((step, i) => {
    let questionIds: number[] = [];
    if (step.kind === 'learn' && step.lessonId) {
      questionIds = lessonById.get(step.lessonId)?.questionIds ?? [];
    } else if (step.kind === 'mix' || step.kind === 'test') {
      questionIds = seededShuffle(dayIds, seed * 31 + i).slice(
        0,
        step.questionCount,
      );
    }
    return {
      kind: step.kind,
      ...(step.lessonId ? { lessonId: step.lessonId } : {}),
      questionIds,
      questionCount: step.questionCount,
    };
  });
}
