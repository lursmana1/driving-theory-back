import 'dotenv/config';
import { initPg } from './lib/pg-data-source';

async function main() {
  const ds = await initPg();

  try {
    const countRows = await ds.query(`
      SELECT COUNT(*)::int AS count
      FROM questions
      WHERE lang = 'ru' AND question_explained ~ '[ა-ჰ]'
    `);
    const sample = await ds.query(`
      SELECT id, question_explained
      FROM questions
      WHERE lang = 'ru' AND question_explained ~ '[ა-ჰ]'
      ORDER BY id
      LIMIT 10
    `);
    console.log('count=', countRows[0]?.count);
    console.log(JSON.stringify(sample, null, 2));
  } finally {
    await ds.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
