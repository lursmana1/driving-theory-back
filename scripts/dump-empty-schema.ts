/**
 * Empty CREATE TABLE for app tables other than questions/categories.
 * No user/exam data.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/dump-empty-schema.ts
 */
import 'dotenv/config';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { initPg } from './lib/pg-data-source';

const OUT = path.resolve('backups/empty-app-tables.sql');
const TABLES = [
  'users',
  'leaderboard_periods',
  'blogs',
  'exam_attempts',
  'user_answers',
  'practice_answers',
];

function ident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function tableDdl(
  ds: Awaited<ReturnType<typeof initPg>>,
  table: string,
): Promise<string> {
  const cols = (await ds.query(
    `SELECT
       a.attname AS name,
       pg_catalog.format_type(a.atttypid, a.atttypmod) AS typ,
       a.attnotnull AS notnull,
       pg_get_expr(ad.adbin, ad.adrelid) AS def
     FROM pg_attribute a
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     LEFT JOIN pg_attrdef ad
       ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
     WHERE n.nspname = 'public'
       AND c.relname = $1
       AND a.attnum > 0
       AND NOT a.attisdropped
     ORDER BY a.attnum`,
    [table],
  )) as { name: string; typ: string; notnull: boolean; def: string | null }[];

  if (!cols.length) throw new Error(`Table ${table} not found on Neon`);

  const pk = (await ds.query(
    `SELECT a.attname AS name
     FROM pg_index i
     JOIN pg_class c ON c.oid = i.indrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (i.indkey)
     WHERE n.nspname = 'public' AND c.relname = $1 AND i.indisprimary
     ORDER BY a.attnum`,
    [table],
  )) as { name: string }[];

  const lines = cols.map((c) => {
    let line = `  ${ident(c.name)} ${c.typ}`;
    if (c.def) line += ` DEFAULT ${c.def}`;
    if (c.notnull) line += ' NOT NULL';
    return line;
  });
  if (pk.length) {
    lines.push(`  PRIMARY KEY (${pk.map((p) => ident(p.name)).join(', ')})`);
  }

  const indexes = (await ds.query(
    `SELECT indexdef
     FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = $1 AND indexname NOT LIKE '%_pkey'`,
    [table],
  )) as { indexdef: string }[];

  const fks = (await ds.query(
    `SELECT pg_get_constraintdef(con.oid) AS def
     FROM pg_constraint con
     JOIN pg_class c ON c.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = $1 AND con.contype = 'f'`,
    [table],
  )) as { def: string }[];

  let sql = `CREATE TABLE IF NOT EXISTS ${ident(table)} (\n${lines.join(',\n')}\n);\n`;
  for (const idx of indexes) {
    const def = idx.indexdef
      .replace(/^CREATE UNIQUE INDEX /, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
      .replace(/^CREATE INDEX /, 'CREATE INDEX IF NOT EXISTS ');
    sql += `${def};\n`;
  }
  for (const fk of fks) {
    sql += `ALTER TABLE ${ident(table)} ADD ${fk.def};\n`;
  }
  return sql;
}

async function main() {
  const ds = await initPg();
  await mkdir(path.dirname(OUT), { recursive: true });
  const parts = ['-- empty users/exams/blogs/practice (no row data)', 'BEGIN;', ''];
  for (const t of TABLES) {
    parts.push(await tableDdl(ds, t), '');
  }
  parts.push('COMMIT;', '');
  await writeFile(OUT, parts.join('\n'), 'utf8');
  await ds.destroy();
  console.log(`Wrote ${OUT}`);
  console.log(`tables=${TABLES.join(',')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
