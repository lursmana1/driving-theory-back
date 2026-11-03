/**
 * Password reset schema: the `password_resets` table and `users.tokenVersion`.
 * Safe to re-run.
 *
 *   npm run db:ensure-password-resets
 */
import 'dotenv/config';
import { initPg } from './lib/pg-data-source';

async function main() {
  const ds = await initPg();
  try {
    await ds.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS "tokenVersion" integer NOT NULL DEFAULT 0;
    `);
    await ds.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id serial PRIMARY KEY,
        "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "tokenHash" char(64) NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "usedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await ds.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_password_resets_token_hash
        ON password_resets ("tokenHash");
    `);
    await ds.query(`
      CREATE INDEX IF NOT EXISTS idx_password_resets_user_created
        ON password_resets ("userId", "createdAt");
    `);
    console.log('password_resets table and users.tokenVersion ready');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
