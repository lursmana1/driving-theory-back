/**
 * Sync categories array from ka → en/ru where they differ.
 * Fixes AM (category 0) showing only ~18 en/ru questions vs 318 ka.
 */
import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const before = await client.query(`
    SELECT lang, COUNT(*)::int AS cnt
    FROM questions
    WHERE 0 = ANY(categories)
    GROUP BY lang
    ORDER BY lang
  `);
  console.log('Before (questions with category 0):');
  console.table(before.rows);

  const mismatched = await client.query(`
    SELECT COUNT(*)::int AS cnt
    FROM questions en
    JOIN questions ka ON ka.id = en.id AND ka.lang = 'ka'
    WHERE en.lang IN ('en', 'ru')
      AND en.categories IS DISTINCT FROM ka.categories
  `);
  console.log('en/ru rows with categories != ka:', mismatched.rows[0].cnt);

  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) {
    console.log('Dry run — no updates applied.');
    await client.end();
    return;
  }

  const updated = await client.query(`
    UPDATE questions en
    SET categories = ka.categories
    FROM questions ka
    WHERE ka.id = en.id
      AND ka.lang = 'ka'
      AND en.lang IN ('en', 'ru')
      AND en.categories IS DISTINCT FROM ka.categories
    RETURNING en.id, en.lang
  `);
  console.log(`Updated ${updated.rowCount} rows.`);

  const after = await client.query(`
    SELECT lang, COUNT(*)::int AS cnt
    FROM questions
    WHERE 0 = ANY(categories)
    GROUP BY lang
    ORDER BY lang
  `);
  console.log('After (questions with category 0):');
  console.table(after.rows);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
