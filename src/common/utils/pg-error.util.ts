import { QueryFailedError } from 'typeorm';

const PG_UNIQUE_VIOLATION = '23505';
const PG_UNDEFINED_TABLE = '42P01';

function pgErrorCode(err: unknown): string | undefined {
  if (!(err instanceof QueryFailedError)) return undefined;
  return (err.driverError as { code?: string } | undefined)?.code;
}

/** True when Postgres rejected a write for breaking a unique constraint. */
export function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === PG_UNIQUE_VIOLATION;
}

/** True when the query referenced a table that does not exist (yet). */
export function isUndefinedTable(err: unknown): boolean {
  return pgErrorCode(err) === PG_UNDEFINED_TABLE;
}
