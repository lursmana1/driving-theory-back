import { QueryFailedError } from 'typeorm';
import { PracticeAnswersService } from './practice-answers.service';

function uniqueViolation(): QueryFailedError {
  const driverError = Object.assign(new Error('duplicate key'), {
    code: '23505',
  });
  return new QueryFailedError('INSERT', [], driverError);
}

describe('PracticeAnswersService.record', () => {
  const question = { id: 5, lang: 'ka', subject: 3, correct_answer: '2' };

  function setup() {
    const practiceRepo = {
      findOne: jest.fn(),
      create: jest.fn((row: object) => row),
      save: jest.fn(),
    };
    const questionRepo = { findOne: jest.fn().mockResolvedValue(question) };
    const service = new PracticeAnswersService(
      practiceRepo as never,
      questionRepo as never,
    );
    return { service, practiceRepo };
  }

  it('retries as an update when a concurrent insert wins the race', async () => {
    const { service, practiceRepo } = setup();
    const winner = {
      questionId: 5,
      lang: 'ka',
      subject: 3,
      correct: false,
      chosenAnswer: '1',
    };
    practiceRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    practiceRepo.save
      .mockRejectedValueOnce(uniqueViolation())
      .mockImplementationOnce((row: object) => Promise.resolve(row));

    const result = await service.record(1, {
      questionId: 5,
      lang: 'ka',
      chosenAnswer: '2',
    });

    expect(result).toMatchObject({ questionId: 5, correct: true });
    expect(practiceRepo.save).toHaveBeenCalledTimes(2);
    expect(practiceRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ correct: true, chosenAnswer: '2' }),
    );
  });

  it('does not swallow other database errors', async () => {
    const { service, practiceRepo } = setup();
    practiceRepo.findOne.mockResolvedValue(null);
    practiceRepo.save.mockRejectedValue(new Error('connection lost'));

    await expect(
      service.record(1, { questionId: 5, lang: 'ka', chosenAnswer: '2' }),
    ).rejects.toThrow('connection lost');
    expect(practiceRepo.save).toHaveBeenCalledTimes(1);
  });
});
