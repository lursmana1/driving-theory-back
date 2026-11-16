/**
 * Writes the lesson-card tables of the database `.env` points at (normally the
 * local, fully seeded one) as one idempotent SQL file for production, where
 * Postgres is reachable only through the Coolify terminal:
 *
 *   wget -qO- https://raw.githubusercontent.com/lursmana1/nest/main/scripts/sql/<FILE> \
 *     | psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1
 *
 * The file upserts `learning_cards` and `learning_card_texts` (title, body,
 * tutor, audio), drops cards that no longer exist, and replaces every
 * `question_cards` row. The three tables hold only script-made reference
 * data (seed-cards, link-sign-cards, upload-card-audio), never user data, so
 * copying them is the same as running those scripts against production.
 * Run the schema file (`06-ensure-study-plan-tables.sql`) first.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/export-cards-sql.ts [--out=scripts/sql/07-….sql]
 *
 * Read-only against the database; without `--out` the SQL goes to stdout.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { initPg } from './lib/pg-data-source';

const ROWS_PER_INSERT = 200;

type CardRow = {
  id: string;
  kind: string;
  subjectId: number | string;
  order: number | string;
  image: string | null;
  signNumber: string | null;
};
type TextRow = {
  cardId: string;
  lang: string;
  title: string;
  body: string | null;
  tutor: string | null;
  audio: string | null;
};
type LinkRow = {
  questionId: number | string;
  cardId: string;
  primary: boolean;
  source: string;
  confirmed: boolean;
};

/** A Postgres string literal (E'' form, so a backslash or newline survives). */
function lit(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (value.includes('\0')) throw new Error('NUL byte in a text value');
  return `E'${value.replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\r/g, '\\r').replace(/\n/g, '\\n')}'`;
}

function chunks<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function argValue(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const out = argValue('out');
  const ds = await initPg();
  try {
    const cards = await ds.query<CardRow[]>(
      `SELECT id, kind, "subjectId", "order", image, "signNumber"
       FROM learning_cards ORDER BY "subjectId", "order", id`,
    );
    const texts = await ds.query<TextRow[]>(
      `SELECT "cardId", lang, title, body, tutor, audio
       FROM learning_card_texts ORDER BY "cardId", lang`,
    );
    const links = await ds.query<LinkRow[]>(
      `SELECT "questionId", "cardId", "primary", source, confirmed
       FROM question_cards ORDER BY "questionId", "cardId"`,
    );
    if (cards.length === 0)
      throw new Error('learning_cards is empty: nothing to export');

    const day = new Date().toISOString().slice(0, 10);
    const sql: string[] = [
      `-- Study plan lesson cards: learning_cards, learning_card_texts, question_cards.`,
      `-- Exported by scripts/export-cards-sql.ts on ${day} from the seeded database`,
      `-- (${cards.length} cards, ${texts.length} texts, ${links.length} links).`,
      `-- Requires the tables from 06-ensure-study-plan-tables.sql. Idempotent: cards and`,
      `-- texts are upserted, cards missing here are deleted (texts and links cascade),`,
      `-- and every question_cards row is replaced. Safe to re-run; one transaction.`,
      `-- Restart the API afterwards: the plan caches these tables for 10 minutes.`,
      ``,
      `BEGIN;`,
      ``,
      `-- 1. cards`,
    ];
    for (const batch of chunks(cards, ROWS_PER_INSERT)) {
      sql.push(
        `INSERT INTO learning_cards (id, kind, "subjectId", "order", image, "signNumber", "updatedAt") VALUES`,
        batch
          .map(
            (c) =>
              `  (${lit(c.id)}, ${lit(c.kind)}, ${Number(c.subjectId)}, ${Number(c.order)}, ${lit(c.image)}, ${lit(c.signNumber)}, now())`,
          )
          .join(',\n'),
        `ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, "subjectId" = EXCLUDED."subjectId",`,
        `  "order" = EXCLUDED."order", image = EXCLUDED.image, "signNumber" = EXCLUDED."signNumber",`,
        `  "updatedAt" = now();`,
        ``,
      );
    }
    sql.push(
      `-- 2. cards that no longer exist (their texts and links cascade)`,
      `DELETE FROM learning_cards WHERE id NOT IN (`,
      chunks(
        cards.map((c) => lit(c.id)),
        20,
      )
        .map((b) => `  ${b.join(', ')}`)
        .join(',\n'),
      `);`,
      ``,
      `-- 3. texts (title, body, tutor, audio)`,
    );
    for (const batch of chunks(texts, ROWS_PER_INSERT)) {
      sql.push(
        `INSERT INTO learning_card_texts ("cardId", lang, title, body, tutor, audio) VALUES`,
        batch
          .map(
            (t) =>
              `  (${lit(t.cardId)}, ${lit(t.lang)}, ${lit(t.title)}, ${lit(t.body)}, ${lit(t.tutor)}, ${lit(t.audio)})`,
          )
          .join(',\n'),
        `ON CONFLICT ("cardId", lang) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body,`,
        `  tutor = EXCLUDED.tutor, audio = EXCLUDED.audio;`,
        ``,
      );
    }
    sql.push(
      `-- 4. links: owned entirely by the seed / link scripts, so replaced as a whole`,
      `DELETE FROM question_cards;`,
      ``,
    );
    for (const batch of chunks(links, ROWS_PER_INSERT)) {
      sql.push(
        `INSERT INTO question_cards ("questionId", "cardId", "primary", source, confirmed) VALUES`,
        batch
          .map(
            (l) =>
              `  (${Number(l.questionId)}, ${lit(l.cardId)}, ${lit(l.primary)}, ${lit(l.source)}, ${lit(l.confirmed)})`,
          )
          .join(',\n'),
        `;`,
        ``,
      );
    }
    sql.push(
      `-- 5. what is there now (expected: ${cards.length} cards, ${texts.length} texts, ${links.length} links)`,
      `SELECT (SELECT count(*) FROM learning_cards) AS cards,`,
      `       (SELECT count(*) FROM learning_card_texts) AS texts,`,
      `       (SELECT count(*) FROM learning_card_texts WHERE audio IS NOT NULL) AS texts_with_audio,`,
      `       (SELECT count(*) FROM question_cards) AS links,`,
      `       (SELECT count(*) FROM question_cards WHERE "primary") AS primary_links;`,
      ``,
      `COMMIT;`,
      ``,
    );

    const text = sql.join('\n');
    if (out) {
      const file = path.resolve(out);
      fs.writeFileSync(file, text, 'utf8');
      console.error(
        `wrote ${file} (${(text.length / 1024).toFixed(0)} KB: ${cards.length} cards, ${texts.length} texts, ${links.length} links)`,
      );
    } else {
      process.stdout.write(text);
    }
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
