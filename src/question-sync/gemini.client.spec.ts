import { getRetryDelayMs, parseGeminiResponse } from './gemini.client';

describe('getRetryDelayMs', () => {
  it('uses the structured retryDelay Gemini returns', () => {
    expect(getRetryDelayMs({ errorDetails: [{ retryDelay: '27s' }] })).toBe(
      27_000,
    );
  });

  it('rounds fractional seconds up to whole milliseconds', () => {
    expect(getRetryDelayMs({ errorDetails: [{ retryDelay: '1.5s' }] })).toBe(
      1500,
    );
  });

  it('skips detail entries that carry no delay', () => {
    expect(getRetryDelayMs({ errorDetails: [{}, { retryDelay: '10s' }] })).toBe(
      10_000,
    );
  });

  it('never waits less than a second', () => {
    expect(getRetryDelayMs({ errorDetails: [{ retryDelay: '0.1s' }] })).toBe(
      1000,
    );
  });

  it('parses the delay out of the error message when unstructured', () => {
    expect(getRetryDelayMs(new Error('Quota exceeded, retry in 42s'))).toBe(
      42_000,
    );
  });

  it('falls back to 15s for an unrecognised error', () => {
    expect(getRetryDelayMs(new Error('boom'))).toBe(15_000);
    expect(getRetryDelayMs(undefined)).toBe(15_000);
  });
});

describe('parseGeminiResponse', () => {
  const complete = {
    ka_explained: 'ახსნა',
    ru_question: 'q',
    en_question: 'q',
    ru_answer_1: 'a',
    ru_answer_2: 'b',
    ru_answer_3: 'c',
    ru_answer_4: 'd',
    en_answer_1: 'a',
    en_answer_2: 'b',
    en_answer_3: 'c',
    en_answer_4: 'd',
    ru_explained: 'e',
    en_explained: 'e',
    ka_tutor: 't',
    ru_tutor: 't',
    en_tutor: 't',
  };

  it('accepts a complete response and drops unknown keys', () => {
    const parsed = parseGeminiResponse(
      JSON.stringify({ ...complete, extra: 'ignored' }),
    );
    expect(parsed).toEqual(complete);
  });

  it('allows blank third/fourth answers for two-option questions', () => {
    const parsed = parseGeminiResponse(
      JSON.stringify({
        ...complete,
        ru_answer_3: '',
        ru_answer_4: null,
        en_answer_3: undefined,
        en_answer_4: '',
      }),
    );
    expect(parsed.ru_answer_4).toBe('');
    expect(parsed.en_answer_3).toBe('');
  });

  it.each([
    ['missing', { ...complete, ru_tutor: undefined }],
    ['blank', { ...complete, ru_tutor: '   ' }],
    ['non-string', { ...complete, ru_tutor: 5 }],
  ])('rejects a %s required field by name', (_label, body) => {
    expect(() => parseGeminiResponse(JSON.stringify(body))).toThrow(/ru_tutor/);
  });

  it('rejects a non-string optional field', () => {
    expect(() =>
      parseGeminiResponse(JSON.stringify({ ...complete, en_answer_3: 3 })),
    ).toThrow(/en_answer_3/);
  });

  it.each(['[]', 'null', '"text"'])('rejects non-object JSON %s', (text) => {
    expect(() => parseGeminiResponse(text)).toThrow(/not a JSON object/);
  });
});
