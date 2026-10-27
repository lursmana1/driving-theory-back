import { NotFoundException } from '@nestjs/common';
import { PracticeAnswersService } from './practice-answers.service';
import { RECORD_PRACTICE_SQL } from './record-practice.query';

describe('PracticeAnswersService.record', () => {
  function setup(rows: object[]) {
    const manager = { query: jest.fn().mockResolvedValue(rows) };
    const service = new PracticeAnswersService(manager as never);
    return { service, manager };
  }

  const gradedRow = {
    questionId: '5',
    lang: 'ka',
    subject: '3',
    correct: false,
    wrongCount: '1',
    correctCount: '0',
    box: '0',
    dueAt: new Date('2000-01-01T00:00:00Z'),
    clearedAt: null,
    reviewsLeft: '3',
  };

  it('sends one statement with a trimmed choice', async () => {
    const { service, manager } = setup([gradedRow]);

    await service.record(1, { questionId: 5, lang: 'ka', chosenAnswer: ' 2 ' });

    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(RECORD_PRACTICE_SQL, [
      1,
      5,
      'ka',
      '2',
    ]);
  });

  it('returns the grade and the progress after a graded answer', async () => {
    const { service } = setup([gradedRow]);

    const result = await service.record(1, {
      questionId: 5,
      lang: 'ka',
      chosenAnswer: '1',
    });

    expect(result).toMatchObject({
      questionId: 5,
      lang: 'ka',
      subject: 3,
      correct: false,
      seenOnly: false,
      progress: { status: 'mistake', due: true, reviewsLeft: 3, wrongCount: 1 },
    });
  });

  it('treats an empty choice as seen-only with no progress', async () => {
    const { service, manager } = setup([
      {
        ...gradedRow,
        correct: null,
        wrongCount: null,
        correctCount: null,
        box: null,
        dueAt: null,
      },
    ]);

    const result = await service.record(1, {
      questionId: 5,
      chosenAnswer: '   ',
    });

    expect(manager.query).toHaveBeenCalledWith(RECORD_PRACTICE_SQL, [
      1,
      5,
      'ka',
      null,
    ]);
    expect(result).toMatchObject({
      correct: null,
      seenOnly: true,
      progress: null,
    });
  });

  it('keeps an earlier grade when a seen-only call hits a graded row', async () => {
    const { service } = setup([
      { ...gradedRow, correct: 't', wrongCount: null, box: null, dueAt: null },
    ]);

    const result = await service.record(1, { questionId: 5 });

    expect(result).toMatchObject({ correct: true, seenOnly: false });
  });

  it('is a 404 when the question is not live in that lang', async () => {
    const { service } = setup([]);

    await expect(
      service.record(1, { questionId: 5, lang: 'en', chosenAnswer: '2' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not swallow database errors', async () => {
    const { service, manager } = setup([]);
    manager.query.mockRejectedValue(new Error('connection lost'));

    await expect(
      service.record(1, { questionId: 5, chosenAnswer: '2' }),
    ).rejects.toThrow('connection lost');
  });
});

describe('RECORD_PRACTICE_SQL', () => {
  it('uses bind parameters only', () => {
    expect(RECORD_PRACTICE_SQL).toContain('$4::text');
    expect(RECORD_PRACTICE_SQL).not.toMatch(/\$\{/);
  });

  it('upserts on the practice unique key and runs the progress CTE', () => {
    expect(RECORD_PRACTICE_SQL).toContain(
      'ON CONFLICT ("userId", "questionId", lang) DO UPDATE',
    );
    const tail = RECORD_PRACTICE_SQL.slice(
      RECORD_PRACTICE_SQL.lastIndexOf('SELECT'),
    );
    expect(tail).toContain('LEFT JOIN progressed');
  });

  it('writes progress only for graded answers', () => {
    const progressed = RECORD_PRACTICE_SQL.slice(
      RECORD_PRACTICE_SQL.indexOf('progressed AS ('),
    );
    expect(progressed).toContain('INSERT INTO question_progress');
    expect(progressed).toContain('WHERE g.correct IS NOT NULL');
  });
});
