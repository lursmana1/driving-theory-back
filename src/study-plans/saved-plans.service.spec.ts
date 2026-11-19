import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SavedPlansService } from './saved-plans.service';
import {
  CREATE_PLAN_SQL,
  UPDATE_PLAN_SQL,
  UPSERT_PLAN_SQL,
} from './saved-plans.sql';
import type { SavePlanDto } from './dto/save-plan.dto';

const row = {
  userId: 7,
  categoryId: 1,
  dayCount: 14,
  startDay: '2026-11-04',
  examDay: null,
  progress: { done: { '0': { '0': '2026-11-04' } }, tests: {} },
  revision: 4,
  createdAt: new Date('2026-11-04T10:00:00Z'),
  updatedAt: new Date('2026-11-04T10:05:00Z'),
};

/** `written`: rows the write statement returns ([] = it did not happen). */
function setup(
  found: object | null = row,
  written: object[] = [{ revision: '5' }],
) {
  const repo = {
    findOne: jest.fn().mockResolvedValue(found),
    query: jest.fn().mockResolvedValue(written),
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

function lastQuery(repo: ReturnType<typeof setup>['repo']) {
  return repo.query.mock.calls[0] as [string, unknown[]];
}

describe('SavedPlansService', () => {
  it('returns the caller’s plan with its revision, scoped by userId', async () => {
    const { service, repo } = setup();
    await expect(service.getMine(7)).resolves.toMatchObject({
      categoryId: 1,
      done: { '0': { '0': '2026-11-04' } },
      revision: 4,
    });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { userId: 7 } });
  });

  it('404 when there is no plan', async () => {
    const { service } = setup(null);
    await expect(service.getMine(7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('no baseRevision: upsert keyed by the caller, clean progress as JSON', async () => {
    const { service, repo } = setup();
    await service.saveMine(7, { ...dto, done: { '0': { '0': '2026-11-04' } } });
    const [sql, params] = lastQuery(repo);
    expect(sql).toBe(UPSERT_PLAN_SQL);
    expect(params).toHaveLength(7);
    expect(params.slice(0, 5)).toEqual([7, 1, 14, '2026-11-04', null]);
    expect(JSON.parse(params[5] as string)).toEqual({
      done: { '0': { '0': '2026-11-04' } },
      tests: {},
      mistakes: {},
    });
    expect(params[6]).toBeInstanceOf(Date);
  });

  it('baseRevision 0: create only', async () => {
    const { service, repo } = setup();
    await service.saveMine(7, { ...dto, baseRevision: 0 });
    const [sql, params] = lastQuery(repo);
    expect(sql).toBe(CREATE_PLAN_SQL);
    expect(params).toHaveLength(7);
  });

  it('baseRevision n: update of revision n only', async () => {
    const { service, repo } = setup();
    await service.saveMine(7, { ...dto, baseRevision: 4 });
    const [sql, params] = lastQuery(repo);
    expect(sql).toBe(UPDATE_PLAN_SQL);
    expect(params[0]).toBe(7);
    expect(params[7]).toBe(4);
  });

  it('returns what it wrote with the new revision, without reading the row back', async () => {
    const { service, repo } = setup();
    await expect(
      service.saveMine(7, { ...dto, baseRevision: 4 }),
    ).resolves.toMatchObject({
      categoryId: 1,
      dayCount: 14,
      startDay: '2026-11-04',
      examDay: null,
      done: { '0': { '0': '2026-11-04' } },
      tests: {},
      revision: 5,
    });
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it('stale revision: 409 carrying the current plan', async () => {
    const { service } = setup(row, []);
    const err = await service
      .saveMine(7, { ...dto, baseRevision: 3 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      plan: { revision: 4, done: { '0': { '0': '2026-11-04' } } },
    });
  });

  it('plan deleted elsewhere: 409 with plan null', async () => {
    const { service } = setup(null, []);
    const err = await service
      .saveMine(7, { ...dto, baseRevision: 4 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
      plan: null,
    });
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
    expect(repo.query).not.toHaveBeenCalled();
  });

  it('deletes only the caller’s row', async () => {
    const { service, repo } = setup();
    await service.deleteMine(7);
    expect(repo.delete).toHaveBeenCalledWith({ userId: 7 });
  });
});
