import { parsePlanProgress } from './progress.util';

describe('parsePlanProgress', () => {
  it('keeps valid progress and drops unknown fields', () => {
    const out = parsePlanProgress(
      {
        done: { '0': { '0': '2026-11-04', '3': '2026-11-04' } },
        tests: { '0': { correct: 18, total: 20, passed: true, extra: 1 } },
      },
      14,
    );
    expect(out).toEqual({
      done: { '0': { '0': '2026-11-04', '3': '2026-11-04' } },
      tests: { '0': { correct: 18, total: 20, passed: true } },
      mistakes: {},
    });
  });

  it('accepts an empty plan', () => {
    expect(parsePlanProgress({ done: {}, tests: {} }, 7)).toEqual({
      done: {},
      tests: {},
      mistakes: {},
    });
  });

  it('keeps day mistakes, deduped, and drops empty lists', () => {
    const out = parsePlanProgress(
      { done: {}, tests: {}, mistakes: { '0': [5, 7, 5], '1': [] } },
      7,
    );
    expect(out?.mistakes).toEqual({ '0': [5, 7] });
  });

  it.each([
    ['not a list', { '0': 5 }],
    ['day past the plan', { '7': [1] }],
    ['id not a positive int', { '0': [0] }],
    ['id as a string', { '0': ['5'] }],
    ['too many ids', { '0': Array.from({ length: 301 }, (_, i) => i + 1) }],
    ['a list instead of days', [1, 2]],
    ['id not an integer', { '0': [1.5] }],
    [
      'too many ids over all days',
      Object.fromEntries(
        ['0', '1', '2', '3'].map((d) => [
          d,
          Array.from({ length: 300 }, (_, i) => Number(d) * 1000 + i + 1),
        ]),
      ),
    ],
  ])('rejects mistakes: %s', (_label, mistakes) => {
    expect(parsePlanProgress({ done: {}, tests: {}, mistakes }, 7)).toBeNull();
  });

  it('treats missing or null mistakes as none', () => {
    for (const mistakes of [undefined, null]) {
      expect(
        parsePlanProgress({ done: {}, tests: {}, mistakes }, 7)?.mistakes,
      ).toEqual({});
    }
  });

  it.each([
    ['day past the plan', { done: { '14': {} }, tests: {} }],
    ['negative / non-numeric day', { done: { x: {} }, tests: {} }],
    ['day key with a leading zero', { done: { '01': {} }, tests: {} }],
    ['step out of range', { done: { '0': { '40': '2026-11-04' } }, tests: {} }],
    ['bad date', { done: { '0': { '0': '2026-02-30' } }, tests: {} }],
    ['date not a string', { done: { '0': { '0': 5 } }, tests: {} }],
    ['steps not an object', { done: { '0': ['2026-11-04'] }, tests: {} }],
    [
      'correct > total',
      { done: {}, tests: { '0': { correct: 9, total: 5, passed: true } } },
    ],
    [
      'test too big',
      { done: {}, tests: { '0': { correct: 1, total: 41, passed: false } } },
    ],
    [
      'passed not boolean',
      { done: {}, tests: { '0': { correct: 1, total: 2, passed: 'yes' } } },
    ],
    ['done is an array', { done: [], tests: {} }],
    ['tests is null', { done: {}, tests: null }],
  ])('rejects %s', (_label, input) => {
    expect(parsePlanProgress(input, 14)).toBeNull();
  });
});
