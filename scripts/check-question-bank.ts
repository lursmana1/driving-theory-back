/**
 * Read-only consistency check of the live question bank. Run it after any import,
 * prune, translation or audio job; it exits 1 when a hard rule is broken.
 *
 *   npm run db:check-question-bank
 *   npm run db:check-question-bank -- --public-dir=../prava/public   # also check image files
 *
 * ka is the source of truth. Hard rules (exit 1):
 *   - every id has ka, ru and en rows
 *   - ru/en correct_answer and categories equal ka
 *   - ru/en have exactly ka's number of answers (no invented extras, none missing)
 *   - correct_answer points at a non-empty answer
 *   - question, question_explained and ai_tutor are non-empty
 *   - hasImg = 1 has an img path (and the file exists, with --public-dir)
 * Warnings (exit 0): rows without audio.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { initPg } from './lib/pg-data-source';
import { CATEGORY_DISPLAY_META } from '../src/common/constants/category.constants';

type Check = { name: string; hard: boolean; sql: string };

const answerCount = (alias: string) =>
  `(SELECT COUNT(*) FROM unnest(ARRAY[${alias}.answer_1, ${alias}.answer_2, ${alias}.answer_3, ${alias}.answer_4]) x WHERE NULLIF(TRIM(x), '') IS NOT NULL)`;

const pair = `questions o JOIN questions ka ON ka.id = o.id AND ka.lang = 'ka' WHERE o.lang IN ('ru', 'en')`;

const CHECKS: Check[] = [
  {
    name: 'ids missing a language',
    hard: true,
    sql: `SELECT id::text AS ref FROM questions GROUP BY id HAVING COUNT(DISTINCT lang) FILTER (WHERE lang IN ('ka','ru','en')) < 3`,
  },
  {
    name: 'ru/en correct_answer differs from ka',
    hard: true,
    sql: `SELECT o.id || ':' || o.lang AS ref FROM ${pair} AND o.correct_answer IS DISTINCT FROM ka.correct_answer`,
  },
  {
    name: 'ru/en categories differ from ka',
    hard: true,
    sql: `SELECT o.id || ':' || o.lang AS ref FROM ${pair} AND o.categories IS DISTINCT FROM ka.categories`,
  },
  {
    name: 'ru/en answer count differs from ka',
    hard: true,
    sql: `SELECT o.id || ':' || o.lang || ' ' || ${answerCount('o')} || ' vs ka ' || ${answerCount('ka')} AS ref
          FROM ${pair} AND ${answerCount('o')} <> ${answerCount('ka')}`,
  },
  {
    name: 'correct_answer points at an empty answer',
    hard: true,
    sql: `SELECT id || ':' || lang AS ref FROM questions
          WHERE NULLIF(TRIM(CASE correct_answer WHEN '1' THEN answer_1 WHEN '2' THEN answer_2
                                                WHEN '3' THEN answer_3 WHEN '4' THEN answer_4 END), '') IS NULL`,
  },
  {
    name: 'empty question / explanation / ai_tutor',
    hard: true,
    sql: `SELECT id || ':' || lang AS ref FROM questions
          WHERE NULLIF(TRIM(question), '') IS NULL OR NULLIF(TRIM(question_explained), '') IS NULL
             OR NULLIF(TRIM(ai_tutor), '') IS NULL`,
  },
  {
    name: 'hasImg = 1 without img path',
    hard: true,
    sql: `SELECT id || ':' || lang AS ref FROM questions WHERE "hasImg" = 1 AND NULLIF(TRIM(img), '') IS NULL`,
  },
  {
    name: 'rows without audio',
    hard: false,
    sql: `SELECT id || ':' || lang AS ref FROM questions WHERE NULLIF(TRIM(audio), '') IS NULL`,
  },
];

async function main() {
  const publicArg = process.argv.find((a) => a.startsWith('--public-dir='));
  const publicDir = publicArg
    ? path.resolve(publicArg.slice('--public-dir='.length))
    : null;
  const ds = await initPg();
  let hardFailures = 0;
  try {
    for (const check of CHECKS) {
      const rows = await ds.query<{ ref: string }[]>(check.sql);
      const status = rows.length === 0 ? 'ok' : check.hard ? 'FAIL' : 'warn';
      if (rows.length && check.hard) hardFailures++;
      const sample = rows
        .slice(0, 10)
        .map((r) => r.ref)
        .join(', ');
      console.log(
        `[${status}] ${check.name}: ${rows.length}${rows.length ? ` (${sample}${rows.length > 10 ? ', …' : ''})` : ''}`,
      );
    }

    if (publicDir) {
      const imgs = await ds.query<{ img: string }[]>(
        `SELECT DISTINCT img FROM questions WHERE "hasImg" = 1 AND NULLIF(TRIM(img), '') IS NOT NULL`,
      );
      const missing = imgs.filter(
        (r) => !fs.existsSync(path.join(publicDir, r.img)),
      );
      if (missing.length) hardFailures++;
      console.log(
        `[${missing.length ? 'FAIL' : 'ok'}] image files missing in ${publicDir}: ${missing.length}${
          missing.length
            ? ` (${missing
                .slice(0, 10)
                .map((r) => r.img)
                .join(', ')})`
            : ''
        }`,
      );
    }

    const counts = await ds.query<{ category: number; count: number }[]>(
      `SELECT c AS category, COUNT(DISTINCT id)::int AS count
       FROM questions CROSS JOIN LATERAL unnest(categories) AS c
       WHERE lang = 'ka' GROUP BY c ORDER BY c`,
    );
    const byId = new Map(
      counts.map((r) => [Number(r.category), Number(r.count)]),
    );
    console.log(
      'Live questions per category: ' +
        CATEGORY_DISPLAY_META.map(
          (c) => `${c.name} ${byId.get(c.id) ?? 0}`,
        ).join(', '),
    );
  } finally {
    await ds.destroy();
  }
  if (hardFailures) {
    console.error(`${hardFailures} hard check(s) failed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
