import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PlanPreviewQueryDto } from './plan-preview-query.dto';

function check(query: Record<string, string>) {
  const dto = plainToInstance(PlanPreviewQueryDto, query);
  return { dto, errors: validateSync(dto) };
}

describe('PlanPreviewQueryDto', () => {
  it('parses category, days and examDay', () => {
    const { dto, errors } = check({
      category: '1',
      days: '14',
      examDay: '2026-12-01',
    });
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ category: 1, days: 14, examDay: '2026-12-01' });
  });

  it('treats empty days / examDay as not given', () => {
    const { dto, errors } = check({ category: '0', days: '', examDay: '' });
    expect(errors).toHaveLength(0);
    expect(dto.days).toBeUndefined();
    expect(dto.examDay).toBeUndefined();
  });

  it.each([
    [{}],
    [{ category: '' }],
    [{ category: '10' }],
    [{ category: '1', days: '2' }],
    [{ category: '1', days: '61' }],
    [{ category: '1', days: '7.5' }],
    [{ category: '1', examDay: '01-12-2026' }],
    [{ category: '1', examDay: '2026-12-01T00:00' }],
  ])('rejects %j', (query: Record<string, string>) => {
    expect(check(query).errors.length).toBeGreaterThan(0);
  });
});
