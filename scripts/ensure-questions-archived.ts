/**
 * Creates the empty `questions_archived` table. Safe to re-run.
 * Must exist before deploying code that grades exam answers against it
 * (`SUBMIT_ANSWER_SQL`), even if nothing has been archived yet.
 *
 *   npm run db:ensure-questions-archived
 */
import 'dotenv/config';
import { initPg } from './lib/pg-data-source';
import { CREATE_QUESTIONS_ARCHIVED_SQL } from './lib/questions-archived.sql';

async function main() {
  const ds = await initPg();
  try {
    await ds.query(CREATE_QUESTIONS_ARCHIVED_SQL);
    console.log('questions_archived table ready');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
