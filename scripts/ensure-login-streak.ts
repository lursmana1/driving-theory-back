/**
 * Adds the login-streak columns on users. Safe to re-run.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/ensure-login-streak.ts
 */
import 'dotenv/config';
import { initPg } from './lib/pg-data-source';

async function main() {
  const ds = await initPg();
  try {
    await ds.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS "currentStreak" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "longestStreak" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "lastActiveDay" date;
    `);
    console.log('users streak columns ready');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
