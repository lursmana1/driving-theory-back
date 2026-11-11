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
      restIds: [],
    },
    {
      id: '4-1',
      subjectId: 4,
      part: 1,
      parts: 1,
      questionIds: [7, 8, 9, 10, 11, 12],
      cardIds: [],
      restIds: [],
    },
  ],
  carryIds: [90, 91],
  optionalIds: [],
  newQuestions: 12,
  steps: [
    { kind: 'learn', lessonId: '3-1', questionCount: 6 },
    { kind: 'learn', lessonId: '4-1', questionCount: 6 },
    { kind: 'review', questionCount: 12 },
    {
      kind: 'test',
      questionCount: 10,
      examParts: { carry: 2, today: 5, older: 3 },
    },
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

  it('fills learn with the lesson; the day exam mixes carry, today and older', () => {
    const older = [50, 51, 52, 53, 54, 55, 56, 57];
    const steps = buildDaySession(day, 7, older);
    expect(steps[0]).toEqual({
      kind: 'learn',
      lessonId: '3-1',
      questionIds: [1, 2, 3, 4, 5, 6],
      questionCount: 6,
    });
    expect(steps[2].questionIds).toEqual([]);
    const exam = steps[3].questionIds;
    expect(exam).toHaveLength(10);
    expect(new Set(exam).size).toBe(10);
    // all of yesterday's extras, 3 older, the rest from today
    expect(exam).toEqual(expect.arrayContaining([90, 91]));
    expect(exam.filter((id) => older.includes(id))).toHaveLength(3);
    expect(exam.filter((id) => id <= 12)).toHaveLength(5);
    expect(buildDaySession(day, 7, older)).toEqual(steps);
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
