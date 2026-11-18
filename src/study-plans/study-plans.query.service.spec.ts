import {
  StudyPlansQueryService,
  SUBJECT_QUESTION_IDS_SQL,
} from './study-plans.query.service';

function setup(query: jest.Mock) {
  return new StudyPlansQueryService({ query } as never);
}

describe('StudyPlansQueryService.loadSubjectQuestions', () => {
  it('reads only ids per subject, with a GIN-friendly category filter', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([{ subject: '3', ids: ['1', '2'] }]);
    const service = setup(query);
    await expect(service.loadSubjectQuestions(1, 0)).resolves.toEqual([
      { subjectId: 3, questionIds: [1, 2] },
    ]);
    expect(query).toHaveBeenCalledWith(SUBJECT_QUESTION_IDS_SQL, ['ka', 1]);
    expect(SUBJECT_QUESTION_IDS_SQL).toContain(
      'q.categories @> ARRAY[$2::int]',
    );
    expect(SUBJECT_QUESTION_IDS_SQL).toContain(
      'SELECT q.subject, array_agg(q.id',
    );
  });

  it('shares one query between concurrent misses and caches the result', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = setup(query);
    const [a, b] = await Promise.all([
      service.loadSubjectQuestions(1, 0),
      service.loadSubjectQuestions(1, 0),
    ]);
    await service.loadSubjectQuestions(1, 1000);
    expect(a).toBe(b);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('reloads after the TTL and never caches a failure', async () => {
    const query = jest
      .fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue([]);
    const service = setup(query);
    await expect(service.loadSubjectQuestions(2, 0)).rejects.toThrow('db down');
    await service.loadSubjectQuestions(2, 1);
    await service.loadSubjectQuestions(2, 24 * 60 * 60 * 1000);
    expect(query).toHaveBeenCalledTimes(3);
  });
});
