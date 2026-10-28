import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TrainerSessionQueryDto } from './trainer-query.dto';

function check(query: Record<string, string | string[]>) {
  const dto = plainToInstance(TrainerSessionQueryDto, query);
  return { dto, errors: validateSync(dto) };
}

describe('TrainerSessionQueryDto', () => {
  it('parses category, subjects and limit', () => {
    const { dto, errors } = check({
      category: '2',
      subjects: '4, 9',
      limit: '30',
    });
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ category: 2, subjects: [4, 9], limit: 30 });
  });

  it('accepts repeated subjects params', () => {
    const { dto, errors } = check({ category: '2', subjects: ['4', '9,11'] });
    expect(errors).toHaveLength(0);
    expect(dto.subjects).toEqual([4, 9, 11]);
  });

  it('drops empty subject segments instead of reading them as 0', () => {
    const { dto, errors } = check({ category: '2', subjects: '4,,9,' });
    expect(errors).toHaveLength(0);
    expect(dto.subjects).toEqual([4, 9]);
    expect(check({ category: '2', subjects: ' , ' }).dto.subjects).toBe(
      undefined,
    );
  });

  it('treats empty subjects and limit as not given', () => {
    const { dto, errors } = check({ category: '0', subjects: '', limit: '' });
    expect(errors).toHaveLength(0);
    expect(dto.subjects).toBeUndefined();
    expect(dto.limit).toBeUndefined();
  });

  it.each([
    [{}],
    [{ category: '' }],
    [{ category: '10' }],
    [{ category: 'x' }],
    [{ category: '1', limit: '51' }],
    [{ category: '1', limit: '0' }],
    [{ category: '1', subjects: '1,abc' }],
    [{ category: '1', subjects: ['1', 'abc'] }],
    [
      {
        category: '1',
        subjects: Array.from({ length: 51 }, (_, i) => i).join(','),
      },
    ],
  ])('rejects %j', (query: Record<string, string | string[]>) => {
    expect(check(query).errors.length).toBeGreaterThan(0);
  });
});
