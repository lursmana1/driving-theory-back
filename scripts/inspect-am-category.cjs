require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('neon')
      ? { rejectUnauthorized: false }
      : undefined,
  });
  await c.connect();

  const missing = await c.query(`
    WITH cat0 AS (
      SELECT DISTINCT id FROM questions WHERE lang = 'ka' AND 0 = ANY(categories)
    )
    SELECT
      (SELECT COUNT(*)::int FROM cat0) AS ka_ids,
      (SELECT COUNT(*)::int FROM cat0 c
         WHERE EXISTS (SELECT 1 FROM questions q WHERE q.id = c.id AND q.lang = 'en')) AS has_en,
      (SELECT COUNT(*)::int FROM cat0 c
         WHERE EXISTS (SELECT 1 FROM questions q WHERE q.id = c.id AND q.lang = 'ru')) AS has_ru,
      (SELECT COUNT(*)::int FROM cat0 c
         WHERE NOT EXISTS (SELECT 1 FROM questions q WHERE q.id = c.id AND q.lang = 'en')) AS missing_en,
      (SELECT COUNT(*)::int FROM cat0 c
         WHERE NOT EXISTS (SELECT 1 FROM questions q WHERE q.id = c.id AND q.lang = 'ru')) AS missing_ru
  `);
  console.log('Category 0 (AM?) ID coverage:', missing.rows[0]);

  const sampleMissing = await c.query(`
    SELECT q.id, q.lang, left(q.question, 70) AS q
    FROM questions q
    WHERE q.lang = 'ka' AND 0 = ANY(q.categories)
      AND NOT EXISTS (SELECT 1 FROM questions e WHERE e.id = q.id AND e.lang = 'en')
    ORDER BY q.id
    LIMIT 15
  `);
  console.log('\nSample ka-only IDs in category 0 (no en row):');
  console.table(sampleMissing.rows);

  const wrongCat = await c.query(`
    SELECT q.id, q.lang, q.categories
    FROM questions q
    WHERE q.lang IN ('en','ru') AND 0 = ANY(q.categories)
    ORDER BY q.id, q.lang
    LIMIT 10
  `);
  console.log('\nSample en/ru rows tagged with category 0:');
  console.table(wrongCat.rows);

  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
