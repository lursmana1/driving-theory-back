import { INestApplication, NotFoundException } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

/** Boots the real controller + pipes over HTTP; only the service is faked. */
describe('QuestionsController (http)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const service = {
    findPaged: jest.fn().mockResolvedValue({ data: [] }),
    findRandom: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [QuestionsController],
      providers: [{ provide: QuestionsService, useValue: service }],
    }).compile();

    app = module.createNestApplication();
    // Same options as main.ts.
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('passes numeric page and category to the service', async () => {
    const res = await fetch(`${baseUrl}/questions?page=3&category=1&size=40`);

    expect(res.status).toBe(200);
    expect(service.findPaged).toHaveBeenCalledWith(
      expect.objectContaining({ page: 3, category: 1, size: 40, lang: 'ka' }),
    );
  });

  it('defaults page to 1 and leaves category unset', async () => {
    await fetch(`${baseUrl}/questions`);

    expect(service.findPaged).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, category: undefined, size: 20 }),
    );
  });

  it.each(['page=abc', 'page=1.5', 'category=x'])(
    'rejects ?%s with 400 instead of reaching the database',
    async (qs) => {
      const res = await fetch(`${baseUrl}/questions?${qs}`);

      expect(res.status).toBe(400);
      expect(service.findPaged).not.toHaveBeenCalled();
    },
  );

  it('treats empty params as not given, like a missing param', async () => {
    const res = await fetch(`${baseUrl}/questions?category=&page=`);

    expect(res.status).toBe(200);
    expect(service.findPaged).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, category: undefined }),
    );
  });

  it('clamps page 0 and count 0 up to 1 instead of rejecting them', async () => {
    await fetch(`${baseUrl}/questions?page=0`);
    await fetch(`${baseUrl}/questions/random?count=0`);

    expect(service.findPaged).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1 }),
    );
    expect(service.findRandom).toHaveBeenCalledWith(
      expect.objectContaining({ count: 1 }),
    );
  });

  it('uses the default random count when count is empty', async () => {
    await fetch(`${baseUrl}/questions/random?count=`);

    expect(service.findRandom).toHaveBeenCalledWith(
      expect.objectContaining({ count: 10 }),
    );
  });

  it('clamps an oversized random count', async () => {
    await fetch(`${baseUrl}/questions/random?count=5000`);

    expect(service.findRandom).toHaveBeenCalledWith(
      expect.objectContaining({ count: 200 }),
    );
  });

  it('rejects a non-numeric random count', async () => {
    const res = await fetch(`${baseUrl}/questions/random?count=abc`);

    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric id', async () => {
    const res = await fetch(`${baseUrl}/questions/abc`);

    expect(res.status).toBe(400);
    expect(service.findOne).not.toHaveBeenCalled();
  });

  it('returns 404 when the service reports a missing question', async () => {
    service.findOne.mockRejectedValue(new NotFoundException());

    const res = await fetch(`${baseUrl}/questions/5?lang=en`);

    expect(res.status).toBe(404);
    expect(service.findOne).toHaveBeenCalledWith(5, 'en');
  });
});
