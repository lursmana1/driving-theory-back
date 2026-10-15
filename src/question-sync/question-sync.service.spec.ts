import { ConflictException } from '@nestjs/common';
import { QuestionSyncService } from './question-sync.service';

describe('QuestionSyncService.runSync', () => {
  function setup() {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const getRawMany = jest.fn(async () => {
      await gate;
      return [];
    });
    const qb = {
      select: () => qb,
      orderBy: () => qb,
      getRawMany,
    };
    const service = new QuestionSyncService(
      { createQueryBuilder: () => qb } as never,
      {} as never,
      {} as never,
    );
    return { service, release };
  }

  it('rejects a second run while one is in flight', async () => {
    const { service, release } = setup();

    const first = service.runSync({ limit: 1 });
    await expect(service.runSync({ limit: 1 })).rejects.toBeInstanceOf(
      ConflictException,
    );

    release();
    await expect(first).resolves.toEqual({ processed: 0, errors: 0 });
  });

  it('allows a new run once the previous one has finished', async () => {
    const { service, release } = setup();
    release();

    await service.runSync({ limit: 1 });
    await expect(service.runSync({ limit: 1 })).resolves.toEqual({
      processed: 0,
      errors: 0,
    });
  });
});
