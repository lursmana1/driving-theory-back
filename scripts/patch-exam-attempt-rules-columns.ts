import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  await client.query(`
    ALTER TABLE exam_attempts
      ADD COLUMN IF NOT EXISTS "minCorrectToPass" integer,
      ADD COLUMN IF NOT EXISTS categories jsonb NOT NULL DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS subjects jsonb NOT NULL DEFAULT '[]'
  `);

  console.log('exam_attempts columns patched.');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
