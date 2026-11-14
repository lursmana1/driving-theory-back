import { describe, expect, it } from '@jest/globals';
import {
  groupLiveCategoryCounts,
  withLiveSubjectCounts,
} from './category-live-counts.util';

describe('groupLiveCategoryCounts', () => {
  it('sums per category and keeps subject-less questions in the total', () => {
    const grouped = groupLiveCategoryCounts([
      { category: '0', subject: '1', count: '5' },
      { category: '0', subject: null, count: '2' },
      { category: 9, subject: 1, count: 7 },
    ]);
    expect(grouped.get(0)?.total).toBe(7);
    expect([...(grouped.get(0)?.bySubject ?? [])]).toEqual([[1, 5]]);
    expect(grouped.get(9)?.total).toBe(7);
  });
});

describe('withLiveSubjectCounts', () => {
  it('keeps stored names, replaces counts, drops empty, sorts by id', () => {
    const live = new Map([
      [2, 4],
      [1, 1],
    ]);
    expect(
      withLiveSubjectCounts(
        [
          { id: 2, name: 'Two', questionsCount: 50 },
          { id: 3, name: 'Three', questionsCount: 50 },
          { id: 1, name: 'One', questionsCount: 50 },
        ],
        live,
      ),
    ).toEqual([
      { id: 1, name: 'One', questionsCount: 1 },
      { id: 2, name: 'Two', questionsCount: 4 },
    ]);
  });

  it('falls back to live subjects when nothing is stored', () => {
    expect(
      withLiveSubjectCounts(
        [],
        new Map([
          [3, 2],
          [1, 1],
        ]),
      ),
    ).toEqual([
      { id: 1, name: 'Subject 1', questionsCount: 1 },
      { id: 3, name: 'Subject 3', questionsCount: 2 },
    ]);
  });
});
