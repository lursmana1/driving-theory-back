import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SubmitAnswerDto } from './submit-answer.dto';

const errorsFor = (body: Record<string, unknown>) =>
  validate(plainToInstance(SubmitAnswerDto, body));

describe('SubmitAnswerDto', () => {
  it('accepts a numeric or numeric-string questionId', async () => {
    expect(await errorsFor({ questionId: 12, chosenAnswer: '2' })).toHaveLength(
      0,
    );
    expect(await errorsFor({ questionId: '12' })).toHaveLength(0);
  });

  it.each([undefined, 'abc', '12abc', 1.5, 0, -3])(
    'rejects questionId=%p',
    async (questionId) => {
      expect(await errorsFor({ questionId })).toHaveLength(1);
    },
  );

  it('accepts a numeric chosenAnswer as its string form', async () => {
    const dto = plainToInstance(SubmitAnswerDto, {
      questionId: 1,
      chosenAnswer: 2,
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.chosenAnswer).toBe('2');
  });

  it('rejects an answer longer than the column', async () => {
    const errors = await errorsFor({
      questionId: 1,
      chosenAnswer: 'x'.repeat(501),
    });
    expect(errors).toHaveLength(1);
  });
});
