/**
 * Creates the lesson-card tables (learning_cards, learning_card_texts,
 * question_cards). Safe to re-run.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/ensure-cards.ts
 *   ... --print-sql   # no DB connection: print the SQL
 */
import 'dotenv/config';
import { initPg } from './lib/pg-data-source';

const SCHEMA_SQL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS learning_cards (
    id varchar(64) NOT NULL,
    kind varchar(10) NOT NULL,
    "subjectId" smallint NOT NULL,
    "order" integer NOT NULL,
    image varchar(256) NULL,
    "signNumber" varchar(16) NULL,
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_learning_cards PRIMARY KEY (id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_learning_cards_subject
    ON learning_cards ("subjectId", "order")`,
  `CREATE TABLE IF NOT EXISTS learning_card_texts (
    "cardId" varchar(64) NOT NULL REFERENCES learning_cards(id) ON DELETE CASCADE,
    lang varchar(5) NOT NULL,
    title text NOT NULL,
    body text NULL,
    tutor text NULL,
    audio varchar(512) NULL,
    CONSTRAINT pk_learning_card_texts PRIMARY KEY ("cardId", lang)
  )`,
  `CREATE TABLE IF NOT EXISTS question_cards (
    "questionId" integer NOT NULL,
    "cardId" varchar(64) NOT NULL REFERENCES learning_cards(id) ON DELETE CASCADE,
    "primary" boolean NOT NULL DEFAULT false,
    source varchar(10) NOT NULL,
    confirmed boolean NOT NULL DEFAULT false,
    CONSTRAINT pk_question_cards PRIMARY KEY ("questionId", "cardId")
  )`,
  `CREATE INDEX IF NOT EXISTS idx_question_cards_card
    ON question_cards ("cardId")`,
  // At most one primary card per question.
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_question_cards_primary
    ON question_cards ("questionId") WHERE "primary"`,
];

async function main() {
  if (process.argv.includes('--print-sql')) {
    console.log(SCHEMA_SQL.map((s) => `${s.trim()};`).join('\n\n'));
    return;
  }
  const ds = await initPg();
  try {
    for (const sql of SCHEMA_SQL) await ds.query(sql);
    console.log('learning_cards, learning_card_texts, question_cards ready');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
