import { toQuestionProgressView } from './question-progress.util';

describe('toQuestionProgressView', () => {
  const now = new Date('2026-10-27T10:00:00Z');
  const base = {
    wrongCount: '0',
    correctCount: '0',
    box: '0',
    dueAt: null,
    clearedAt: null,
    reviewsLeft: '0',
  };

  it('is a due mistake right after a wrong answer', () => {
    expect(
      toQuestionProgressView(
        {
          ...base,
          wrongCount: '1',
          reviewsLeft: '3',
          dueAt: '2026-10-27T09:59:00Z',
        },
        now,
      ),
    ).toEqual({
      status: 'mistake',
      due: true,
      dueAt: new Date('2026-10-27T09:59:00Z'),
      reviewsLeft: 3,
      wrongCount: 1,
      correctCount: 0,
    });
  });

  it('counts down reviews and is not due before dueAt', () => {
    const view = toQuestionProgressView(
      {
        ...base,
        box: 1,
        reviewsLeft: 2,
        dueAt: new Date('2026-10-30T20:00:00Z'),
      },
      now,
    );
    expect(view).toMatchObject({
      status: 'mistake',
      due: false,
      reviewsLeft: 2,
    });
  });

  it('is cleared when not due and clearedAt is set', () => {
    expect(
      toQuestionProgressView(
        { ...base, box: 4, clearedAt: '2026-10-20T08:00:00Z' },
        now,
      ),
    ).toMatchObject({
      status: 'cleared',
      due: false,
      dueAt: null,
      reviewsLeft: 0,
    });
  });

  it('is correct for a question never answered wrong', () => {
    expect(
      toQuestionProgressView({ ...base, correctCount: 3 }, now),
    ).toMatchObject({ status: 'correct', reviewsLeft: 0, correctCount: 3 });
  });
});
