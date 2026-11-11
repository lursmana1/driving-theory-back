import {
  buildDaySession,
  daySessionSeed,
  seededShuffle,
} from './day-session.util';
import type { PlanDay } from '../study-plans.types';

const day: PlanDay = {
  index: 1,
  date: '2026-11-05',
  kind: 'learn',
  lessons: [
    {
      id: '3-1',
      subjectId: 3,
      part: 1,
      parts: 2,
      questionIds: [1, 2, 3, 4, 5, 6],
      cardIds: [],
    },
    {
      id: '4-1',
      subjectId: 4,
      part: 1,
      parts: 1,
      questionIds: [7, 8, 9, 10, 11, 12],
      cardIds: [],
    },
  ],
  newQuestions: 12,
  steps: [
    { kind: 'learn', lessonId: '3-1', questionCount: 6 },
    { kind: 'learn', lessonId: '4-1', questionCount: 6 },
    { kind: 'review', questionCount: 12 },
    { kind: 'mix', questionCount: 10 },
    { kind: 'test', questionCount: 12 },
  ],
  minutes: 10,
};

describe('day session', () => {
  it('is deterministic for a seed and keeps every item', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(seededShuffle(items, 42)).toEqual(seededShuffle(items, 42));
    expect([...seededShuffle(items, 42)].sort((a, b) => a - b)).toEqual(items);
    expect(seededShuffle(items, 42)).not.toEqual(seededShuffle(items, 43));
  });

  it('fills learn with the lesson, mix/test from the day, review empty', () => {
    const steps = buildDaySession(day, 7);
    expect(steps[0]).toEqual({
      kind: 'learn',
      lessonId: '3-1',
      questionIds: [1, 2, 3, 4, 5, 6],
      questionCount: 6,
    });
    expect(steps[2].questionIds).toEqual([]);
    expect(steps[3].questionIds).toHaveLength(10);
    expect([...steps[4].questionIds].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(buildDaySession(day, 7)).toEqual(steps);
  });

  it('day seed is pinned and unique per (category, length, day)', () => {
    expect(daySessionSeed(1, 14, 3)).toBe(11_403);
    const seeds = new Set<number>();
    for (let c = 0; c <= 9; c++) {
      for (let d = 3; d <= 60; d++) {
        for (let i = 0; i < d; i++) seeds.add(daySessionSeed(c, d, i));
      }
    }
    let count = 0;
    for (let d = 3; d <= 60; d++) count += d * 10;
    expect(seeds.size).toBe(count);
  });
});
