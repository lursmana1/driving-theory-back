import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  CategoriesService,
  LIVE_CATEGORY_COUNTS_SQL,
} from './categories.service';
import { Category } from './entities/category.entity';
import { Question } from '../questions/entities/question.entity';

describe('CategoriesService', () => {
  let service: CategoriesService;
  const categoryRepo = { find: jest.fn(), findOne: jest.fn() };
  const questionRepo = { query: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: getRepositoryToken(Category), useValue: categoryRepo },
        { provide: getRepositoryToken(Question), useValue: questionRepo },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    // (category, subject, count) — category 6 has 3 + 2 + 1 (no subject).
    questionRepo.query.mockResolvedValue([
      { category: 6, subject: 1, count: '3' },
      { category: 6, subject: 2, count: '2' },
      { category: 6, subject: null, count: '1' },
      { category: 1, subject: 1, count: '4' },
    ]);
  });

  it('counts live questions instead of the stored columns', async () => {
    categoryRepo.find.mockResolvedValue([
      { id: 1, name: 'Category 1', iconKey: null, subjects: [] },
      {
        id: 6,
        name: 'Category 6',
        iconKey: null,
        subjects: [
          { id: 1, name: 'S1', questionsCount: 99 },
          { id: 2, name: 'S2', questionsCount: 99 },
          { id: 3, name: 'S3', questionsCount: 99 },
        ],
      },
      { id: 7, name: 'Category 7', iconKey: null, subjects: [] },
    ]);

    const result = await service.findAll();

    expect(questionRepo.query).toHaveBeenCalledWith(LIVE_CATEGORY_COUNTS_SQL, [
      'ka',
    ]);
    expect(
      result.map((c) => [c.id, c.name, c.questionsCount, c.subjectCount]),
    ).toEqual([
      [1, 'B', 4, 1],
      [6, 'D1', 6, 2],
      [7, 'Military', 0, 0],
    ]);
  });

  it('returns live subject counts and drops empty subjects', async () => {
    categoryRepo.findOne.mockResolvedValue({
      id: 6,
      name: 'Category 6',
      iconKey: null,
      questionsCount: 982,
      subjectCount: 3,
      subjects: [
        { id: 2, name: 'S2', questionsCount: 99 },
        { id: 1, name: 'S1', questionsCount: 99 },
        { id: 3, name: 'S3', questionsCount: 99 },
      ],
    });

    const result = await service.findOne(6);

    expect(result.questionsCount).toBe(6);
    expect(result.subjectCount).toBe(2);
    expect(result.subjects).toEqual([
      { id: 1, name: 'S1', questionsCount: 3 },
      { id: 2, name: 'S2', questionsCount: 2 },
    ]);
  });

  it('404s an unknown category', async () => {
    categoryRepo.findOne.mockResolvedValue(null);
    await expect(service.findOne(42)).rejects.toBeInstanceOf(NotFoundException);
  });
});
