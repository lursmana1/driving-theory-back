import { MistakeTrainerService } from './mistake-trainer.service';

describe('MistakeTrainerService', () => {
  const filter = { userId: 7, categoryId: 2, lang: 'ka' };

  function setup(sessionRows: object[], summaryRow: object | undefined) {
    const queries = {
      loadSession: jest.fn().mockResolvedValue(sessionRows),
      loadSummary: jest.fn().mockResolvedValue(summaryRow),
    };
    const service = new MistakeTrainerService(queries as never);
    return { service, queries };
  }

  it('splits each row into question and progress', async () => {
    const { service, queries } = setup(
      [
        {
          id: '12',
          lang: 'ka',
          question: 'Q',
          question_explained: null,
          hasImg: '1',
          correct_answer: '3',
          answer_1: 'a',
          answer_2: 'b',
          answer_3: 'c',
          answer_4: null,
          subject: '4',
          categories: [2],
          audio: null,
          ai_tutor: null,
          img: 'x.png',
          wrongCount: '2',
          correctCount: '1',
          box: '1',
          dueAt: new Date('2000-01-01T00:00:00Z'),
          clearedAt: null,
          reviewsLeft: '3',
        },
      ],
      {
        activeMistakes: '5',
        dueNow: '3',
        clearedRecently: '1',
        nextDueAt: '2030-01-01T00:00:00Z',
      },
    );

    const result = await service.getSession(filter);

    expect(queries.loadSession).toHaveBeenCalledWith(filter, 20);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].question).toMatchObject({
      id: 12,
      hasImg: 1,
      subject: 4,
      correct_answer: '3',
    });
    expect(result.data[0].question).not.toHaveProperty('box');
    expect(result.data[0].progress).toMatchObject({
      status: 'mistake',
      due: true,
      reviewsLeft: 3,
      wrongCount: 2,
    });
    expect(result.summary).toEqual({
      activeMistakes: 5,
      dueNow: 3,
      clearedRecently: 1,
      nextDueAt: new Date('2030-01-01T00:00:00Z'),
    });
  });

  it('returns zeros when the user has no progress', async () => {
    const { service } = setup([], undefined);

    await expect(service.getSummary(filter)).resolves.toEqual({
      activeMistakes: 0,
      dueNow: 0,
      clearedRecently: 0,
      nextDueAt: null,
    });
  });
});
