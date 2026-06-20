import 'dotenv/config';
import { initPg } from './lib/pg-data-source';

async function main() {
  const ds = await initPg();

  try {
    const byLang = await ds.query(`
      SELECT lang, COUNT(*)::int AS count
      FROM questions
      GROUP BY lang
      ORDER BY lang
    `);

    const completeness = await ds.query(`
      SELECT
        (COUNT(*) FILTER (WHERE langs @> ARRAY['ka','ru','en']::varchar[]))::int AS complete,
        (COUNT(*) FILTER (WHERE NOT (langs @> ARRAY['ka','ru','en']::varchar[])))::int AS incomplete
      FROM (
        SELECT id, array_agg(DISTINCT lang) AS langs
        FROM questions
        GROUP BY id
      ) t
    `);

    const missingExplained = await ds.query(`
      SELECT COUNT(*)::int AS count
      FROM questions
      WHERE question_explained IS NULL OR TRIM(question_explained) = ''
    `);

    const missingTutor = await ds.query(`
      SELECT COUNT(*)::int AS count
      FROM questions
      WHERE ai_tutor IS NULL OR TRIM(ai_tutor) = ''
    `);

    console.log('byLang=', JSON.stringify(byLang));
    console.log('idCompleteness=', JSON.stringify(completeness[0]));
    console.log('missingExplained=', missingExplained[0]?.count);
    console.log('missingTutor=', missingTutor[0]?.count);
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('Verify failed:', err);
  process.exit(1);
});
