/**
 * Dump only questions + categories from Neon (no users / exams / stats).
 *
 *   npx ts-node -r tsconfig-paths/register scripts/dump-questions-categories.ts
 *
 * Writes backups/questions-categories.sql (gitignored). Restore on Coolify:
 *   psql "$DATABASE_URL" -f questions-categories.sql
 */
import 'dotenv/config';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { initPg } from './lib/pg-data-source';

const OUT = path.resolve('backups/questions-categories.sql');

function sqlLiteral(value: unknown, typ: string): string {
  if (value === null || value === undefined) return 'NULL';
  const t = typ.toLowerCase();
  if (t.includes('json')) {
    return `${quote(JSON.stringify(value))}::jsonb`;
  }
  if (t.includes('[]') || t.includes('array')) {
    const arr = Array.isArray(value) ? value : [];
    if (arr.length === 0) return `ARRAY[]::integer[]`;
    const inner = arr
      .map((n) => {
        const x = Number(n);
        if (!Number.isFinite(x)) throw new Error(`Bad int[] value: ${n}`);
        return String(x);
      })
      .join(',');
    return `ARRAY[${inner}]::integer[]`;
  }
  if (typeof value === 'object') {
    return `${quote(JSON.stringify(value))}::jsonb`;
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return quote(String(value));
}

function quote(s: string): string {
  return `E'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function cell(row: Record<string, unknown>, name: string): unknown {
  if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  const lower = name.toLowerCase();
  const hit = Object.keys(row).find((k) => k.toLowerCase() === lower);
  return hit ? row[hit] : null;
}

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

  let sql = `DROP TABLE IF EXISTS ${ident(table)} CASCADE;\n`;
  sql += `CREATE TABLE ${ident(table)} (\n${lines.join(',\n')}\n);\n`;
  for (const idx of indexes) {
    sql += `${idx.indexdef};\n`;
  }
  return sql;
}

async function insertSql(
  ds: Awaited<ReturnType<typeof initPg>>,
  table: string,
): Promise<{ sql: string; rows: number }> {
  const colRows = (await ds.query(
    `SELECT a.attname AS name,
            pg_catalog.format_type(a.atttypid, a.atttypmod) AS typ
     FROM pg_attribute a
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = $1
       AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`,
    [table],
  )) as { name: string; typ: string }[];
  const cols = colRows.map((c) => c.name);
  const types = Object.fromEntries(colRows.map((c) => [c.name, c.typ]));

  const data = (await ds.query(`SELECT * FROM ${ident(table)}`)) as Record<
    string,
    unknown
  >[];

  if (!data.length) {
    return { sql: `-- ${table}: 0 rows\n`, rows: 0 };
  }

  const colList = cols.map(ident).join(', ');
  const chunks: string[] = [];
  const size = 200;
  for (let i = 0; i < data.length; i += size) {
    const slice = data.slice(i, i + size);
    const values = slice
      .map(
        (row) =>
          `  (${cols.map((c) => sqlLiteral(cell(row, c), types[c])).join(', ')})`,
      )
      .join(',\n');
    chunks.push(
      `INSERT INTO ${ident(table)} (${colList}) VALUES\n${values};\n`,
    );
  }
  return { sql: chunks.join('\n'), rows: data.length };
}

async function main() {
  const ds = await initPg();
  await mkdir(path.dirname(OUT), { recursive: true });

  const parts = [
    '-- questions + categories only (no users / exams / stats)',
    'BEGIN;',
    '',
    await tableDdl(ds, 'categories'),
    await tableDdl(ds, 'questions'),
    '',
  ];

  const cats = await insertSql(ds, 'categories');
  const qs = await insertSql(ds, 'questions');
  parts.push(cats.sql, qs.sql, 'COMMIT;', '');

  await writeFile(OUT, parts.join('\n'), 'utf8');
  await ds.destroy();

  console.log(`Wrote ${OUT}`);
  console.log(`categories=${cats.rows} questions=${qs.rows}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
