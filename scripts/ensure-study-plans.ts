/**
 * Creates study_plans (one saved study plan per signed-in user) and adds
 * columns added later (`revision`, 2026-11). Safe to re-run.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/ensure-study-plans.ts
 *   ... --print-sql   # no DB connection: print the SQL (Coolify psql terminal)
 *
 * Run before deploying the API that serves /study-plans/me.
 */
import 'dotenv/config';
import { initPg } from './lib/pg-data-source';

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS study_plans (
    "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "categoryId" smallint NOT NULL,
    "dayCount" smallint NOT NULL,
    "startDay" date NOT NULL,
    "examDay" date NULL,
    progress jsonb NOT NULL DEFAULT '{"done":{},"tests":{}}',
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    revision integer NOT NULL DEFAULT 1,
    CONSTRAINT pk_study_plans PRIMARY KEY ("userId")
  );
  ALTER TABLE study_plans
    ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1`;

async function main() {
  if (process.argv.includes('--print-sql')) {
    console.log(`${SCHEMA_SQL.trim()};`);
    return;
  }
  const ds = await initPg();
  try {
    await ds.query(SCHEMA_SQL);
    console.log('study_plans ready');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
