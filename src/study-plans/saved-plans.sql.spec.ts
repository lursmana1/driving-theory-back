import {
  CREATE_PLAN_SQL,
  planWriteQuery,
  UPDATE_PLAN_SQL,
  UPSERT_PLAN_SQL,
  type PlanWriteValues,
} from './saved-plans.sql';

const placeholders = (sql: string) =>
  [...new Set(sql.match(/\$\d+/g) ?? [])].sort();

describe('saved plan SQL', () => {
  it.each([
    ['upsert', UPSERT_PLAN_SQL, 7],
    ['create', CREATE_PLAN_SQL, 7],
    ['update', UPDATE_PLAN_SQL, 8],
  ])('%s uses exactly $1..$%i and returns the revision', (_l, sql, n) => {
    expect(placeholders(sql)).toEqual(
      Array.from({ length: n }, (_, i) => `$${i + 1}`).sort(),
    );
    expect(sql).toMatch(/RETURNING revision\s*\)\s*SELECT revision FROM saved/);
    expect(sql).not.toContain('createdAt');
  });

  it('every write bumps the revision except a fresh insert (DB default 1)', () => {
    expect(UPSERT_PLAN_SQL).toContain('revision = study_plans.revision + 1');
    expect(UPDATE_PLAN_SQL).toContain('revision = revision + 1');
    expect(CREATE_PLAN_SQL).not.toContain('revision +');
  });

  it('conditional writes: create skips an existing row, update needs the same revision', () => {
    expect(CREATE_PLAN_SQL).toContain('ON CONFLICT ("userId") DO NOTHING');
    expect(UPDATE_PLAN_SQL).toContain(
      'WHERE "userId" = $1::int AND revision = $8::int',
    );
  });

  describe('planWriteQuery', () => {
    const values: PlanWriteValues = {
      userId: 7,
      categoryId: 1,
      dayCount: 14,
      startDay: '2026-11-04',
      examDay: null,
      progress: { done: {}, tests: {}, mistakes: { '0': [5] } },
      updatedAt: new Date('2026-11-19T10:00:00Z'),
    };

    it('no baseRevision: upsert, 7 params, progress as JSON text', () => {
      const { sql, params } = planWriteQuery(values);
      expect(sql).toBe(UPSERT_PLAN_SQL);
      expect(params).toEqual([
        7,
        1,
        14,
        '2026-11-04',
        null,
        '{"done":{},"tests":{},"mistakes":{"0":[5]}}',
        values.updatedAt,
      ]);
    });

    it('baseRevision 0: create only, same params', () => {
      const { sql, params } = planWriteQuery(values, 0);
      expect(sql).toBe(CREATE_PLAN_SQL);
      expect(params).toHaveLength(7);
    });

    it('baseRevision n: update, n is $8', () => {
      const { sql, params } = planWriteQuery(values, 4);
      expect(sql).toBe(UPDATE_PLAN_SQL);
      expect(params).toHaveLength(8);
      expect(params[7]).toBe(4);
    });
  });
});
