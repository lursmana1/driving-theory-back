import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SavedPlansService } from './saved-plans.service';
import type { SavePlanDto } from './dto/save-plan.dto';

const row = {
  userId: 7,
  categoryId: 1,
  dayCount: 14,
  startDay: '2026-11-04',
  examDay: null,
  progress: { done: { '0': { '0': '2026-11-04' } }, tests: {} },
  createdAt: new Date('2026-11-04T10:00:00Z'),
  updatedAt: new Date('2026-11-04T10:05:00Z'),
};

function setup(found: object | null = row) {
  const repo = {
    findOne: jest.fn().mockResolvedValue(found),
    upsert: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  return { repo, service: new SavedPlansService(repo as never) };
}

const dto: SavePlanDto = {
  categoryId: 1,
  dayCount: 14,
  startDay: '2026-11-04',
  examDay: null,
  done: { '0': { '0': '2026-11-04' } },
  tests: {},
};

describe('SavedPlansService', () => {
  it('returns the caller’s plan, scoped by userId', async () => {
    const { service, repo } = setup();
    await expect(service.getMine(7)).resolves.toMatchObject({
      categoryId: 1,
      done: { '0': { '0': '2026-11-04' } },
    });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { userId: 7 } });
  });

  it('404 when there is no plan', async () => {
    const { service } = setup(null);
    await expect(service.getMine(7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('upserts on userId without touching createdAt', async () => {
    const { service, repo } = setup();
    await service.saveMine(7, dto);
    const [values, options] = repo.upsert.mock.calls[0] as [
      Record<string, unknown>,
      unknown,
    ];
    expect(values).toMatchObject({ userId: 7, dayCount: 14, examDay: null });
    expect(values).not.toHaveProperty('createdAt');
    expect(options).toEqual({ conflictPaths: ['userId'] });
  });

  it('returns what it wrote without reading the row back', async () => {
    const { service, repo } = setup();
    await expect(service.saveMine(7, dto)).resolves.toMatchObject({
      categoryId: 1,
      dayCount: 14,
      startDay: '2026-11-04',
      examDay: null,
      done: { '0': { '0': '2026-11-04' } },
      tests: {},
    });
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it.each([
    ['bad start day', { ...dto, startDay: '2026-02-30' }],
    ['bad exam day', { ...dto, examDay: '2026-13-01' }],
    ['bad progress', { ...dto, done: { '99': {} } }],
  ])('400 on %s, nothing written', async (_label, body) => {
    const { service, repo } = setup();
    await expect(service.saveMine(7, body)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('deletes only the caller’s row', async () => {
    const { service, repo } = setup();
    await service.deleteMine(7);
    expect(repo.delete).toHaveBeenCalledWith({ userId: 7 });
  });
});
