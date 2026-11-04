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
    });
  });

  it('accepts an empty plan', () => {
    expect(parsePlanProgress({ done: {}, tests: {} }, 7)).toEqual({
      done: {},
      tests: {},
    });
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
      { done: {}, tests: { '0': { correct: 1, total: 31, passed: false } } },
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
