import type { StudyPlanProgress } from './study-plans.types.js';

/**
 * Writes of PUT /study-plans/me. Each is one statement that returns the new
 * `revision`, or no row when the write did not happen (conditional saves).
 * Wrapped in a CTE so TypeORM hands back plain rows for every command
 * (a bare UPDATE comes back as `[rows, count]`).
 *
 * Parameters: $1 userId, $2 categoryId, $3 dayCount, $4 startDay,
 * $5 examDay, $6 progress (JSON text), $7 updatedAt; $8 baseRevision
 * (update only). createdAt is never written (DB default on insert).
 */

const COLUMNS = `"userId", "categoryId", "dayCount", "startDay", "examDay", progress, "updatedAt"`;
const VALUES = `$1::int, $2::smallint, $3::smallint, $4::date, $5::date, $6::jsonb, $7::timestamptz`;

/** No `baseRevision` (clients before revisions): create or replace, last write wins. */
export const UPSERT_PLAN_SQL = `
WITH saved AS (
  INSERT INTO study_plans (${COLUMNS})
  VALUES (${VALUES})
  ON CONFLICT ("userId") DO UPDATE SET
    "categoryId" = EXCLUDED."categoryId",
    "dayCount" = EXCLUDED."dayCount",
    "startDay" = EXCLUDED."startDay",
    "examDay" = EXCLUDED."examDay",
    progress = EXCLUDED.progress,
    "updatedAt" = EXCLUDED."updatedAt",
    revision = study_plans.revision + 1
  RETURNING revision
)
SELECT revision FROM saved`;

/** `baseRevision: 0`: the client saw no plan; only creates. */
export const CREATE_PLAN_SQL = `
WITH saved AS (
  INSERT INTO study_plans (${COLUMNS})
  VALUES (${VALUES})
  ON CONFLICT ("userId") DO NOTHING
  RETURNING revision
)
SELECT revision FROM saved`;

/** `baseRevision > 0`: only when the row is still the one the client read. */
export const UPDATE_PLAN_SQL = `
WITH saved AS (
  UPDATE study_plans SET
    "categoryId" = $2::smallint,
    "dayCount" = $3::smallint,
    "startDay" = $4::date,
    "examDay" = $5::date,
    progress = $6::jsonb,
    "updatedAt" = $7::timestamptz,
    revision = revision + 1
  WHERE "userId" = $1::int AND revision = $8::int
  RETURNING revision
)
SELECT revision FROM saved`;

export type PlanWriteValues = {
  userId: number;
  categoryId: number;
  dayCount: number;
  startDay: string;
  examDay: string | null;
  /** Already validated (`parsePlanProgress`). */
  progress: StudyPlanProgress;
  updatedAt: Date;
};

/** The statement for a save and its parameters, by `baseRevision`. */
export function planWriteQuery(
  v: PlanWriteValues,
  baseRevision?: number,
): { sql: string; params: unknown[] } {
  const params: unknown[] = [
    v.userId,
    v.categoryId,
    v.dayCount,
    v.startDay,
    v.examDay,
    JSON.stringify(v.progress),
    v.updatedAt,
  ];
  if (baseRevision == null) return { sql: UPSERT_PLAN_SQL, params };
  if (baseRevision === 0) return { sql: CREATE_PLAN_SQL, params };
  return { sql: UPDATE_PLAN_SQL, params: [...params, baseRevision] };
}
