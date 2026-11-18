import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StudyPlansService } from './study-plans.service';
import type { SubjectQuestions } from './study-plans.types';

const subjects: readonly SubjectQuestions[] = [
  { subjectId: 3, questionIds: Array.from({ length: 40 }, (_, i) => i + 1) },
  { subjectId: 4, questionIds: Array.from({ length: 40 }, (_, i) => i + 101) },
];

// 2026-11-04 10:00 Tbilisi.
const now = new Date('2026-11-04T06:00:00Z');

function setup(data: readonly SubjectQuestions[] = subjects) {
  const queries = {
    loadSubjectQuestions: jest.fn().mockResolvedValue(data),
    loadQuestions: jest
      .fn()
      .mockImplementation((ids: number[]) =>
        Promise.resolve(ids.map((id) => ({ id }))),
      ),
  };
  const input = { subjects: data, cardTickets: new Map() };
  const cards = {
    loadPlanSubjects: jest.fn().mockResolvedValue(input),
    loadLessonCards: jest.fn().mockResolvedValue([]),
  };
  return {
    queries,
    cards,
    service: new StudyPlansService(queries as never, cards as never),
  };
}

describe('StudyPlansService', () => {
  it('builds a preview without question ids', async () => {
    const { service } = setup();
    const preview = await service.getPreview({ categoryId: 1, days: 7 }, now);
    expect(preview).toMatchObject({
      categoryId: 1,
      dayCount: 7,
      startDay: '2026-11-04',
      examDay: null,
      intensive: true,
    });
    expect(preview.days[0].lessons[0]).not.toHaveProperty('questionIds');
  });

  it('reuses the built schedule for the same input', async () => {
    const { service } = setup();
    const a = await service.getPreview({ categoryId: 1, days: 14 }, now);
    const b = await service.getPreview({ categoryId: 1, days: 14 }, now);
    expect(b.days[0].steps).toBe(a.days[0].steps);
    const other = await service.getPreview({ categoryId: 1, days: 7 }, now);
    expect(other.days[0].steps).not.toBe(a.days[0].steps);
  });

  it('a day carries step ids and the questions, stable across calls', async () => {
    const { service, queries } = setup();
    const a = await service.getDay({ categoryId: 1, days: 7 }, 0, 'en', now);
    const b = await service.getDay({ categoryId: 1, days: 7 }, 0, 'en', now);
    expect(a.steps).toEqual(b.steps);
    const ids = [...new Set(a.steps.flatMap((s) => s.questionIds))];
    expect(queries.loadQuestions).toHaveBeenCalledWith(ids, 'en');
    expect(a.questions).toHaveLength(ids.length);
  });

  it('404 for a day outside the plan or a category without questions', async () => {
    await expect(
      setup().service.getDay({ categoryId: 1, days: 7 }, 7, 'ka', now),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      setup([]).service.getPreview({ categoryId: 1, days: 7 }, now),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['no length', { categoryId: 1 }],
    ['impossible exam day', { categoryId: 1, examDay: '2026-02-30' }],
    ['exam too soon', { categoryId: 1, examDay: '2026-11-05' }],
  ])('400 on %s', async (_label, query) => {
    await expect(setup().service.getPreview(query, now)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
