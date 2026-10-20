/**
 * Adds blogs."viewsCount" for the public view counter. Safe to re-run.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/ensure-blog-views.ts
 */
import 'dotenv/config';
import { initPg } from './lib/pg-data-source';

async function main() {
  const ds = await initPg();
  try {
    await ds.query(`
      ALTER TABLE blogs
        ADD COLUMN IF NOT EXISTS "viewsCount" integer NOT NULL DEFAULT 0;
    `);
    console.log('blogs."viewsCount" ready');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
