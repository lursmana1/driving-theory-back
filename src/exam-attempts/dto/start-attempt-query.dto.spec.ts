import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StartAttemptQueryDto } from './start-attempt-query.dto';

async function errorsFor(query: Record<string, string>) {
  return validate(plainToInstance(StartAttemptQueryDto, query));
}

describe('StartAttemptQueryDto', () => {
  it('accepts a missing count', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('treats an empty count as missing, not as 0', async () => {
    const dto = plainToInstance(StartAttemptQueryDto, { count: '' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.count).toBeUndefined();
  });

  it('converts a numeric string within bounds', async () => {
    const dto = plainToInstance(StartAttemptQueryDto, { count: '30' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.count).toBe(30);
  });

  it.each(['-5', '0', '1', '9', '41', '100000', '12.5', 'abc'])(
    'rejects count=%s',
    async (count) => {
      expect(await errorsFor({ count })).toHaveLength(1);
    },
  );
});
