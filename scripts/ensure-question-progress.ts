/**
 * Creates question_progress (mistake trainer / study plan state) and, with
 * --backfill, fills it from existing answer history. Safe to re-run.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/ensure-question-progress.ts
 *   ... --backfill --dry-run   # counts only, writes nothing but the table
 *   ... --backfill             # replay history into question_progress
 *
 * Must run before deploying the API that writes question_progress: exam
 * answers and practice answers fail while the table is missing.
 *
 * Backfill only touches (user, question) pairs that have no progress row
 * yet, so re-running it never double-counts. It replays exam answers and
 * graded practice answers (live questions only) in answer order, one round
 * per answer index, inside one transaction. Practice keeps only the last
 * answer per question, so practice-heavy schedules are approximate; they
 * settle after the next review.
 */
import 'dotenv/config';
import { initPg } from './lib/pg-data-source';
import { upsertQuestionProgressSql } from '../src/question-progress/question-progress.sql';
import { MISTAKE_MAX_REVIEWS } from '../src/common/constants/question-progress.constants';

const args = new Set(process.argv.slice(2));
const BACKFILL = args.has('--backfill');
const DRY_RUN = args.has('--dry-run');

const HISTORY_SQL = `
  CREATE TEMP TABLE qp_history ON COMMIT DROP AS
  SELECT
    h.user_id,
    h.question_id,
    h.correct,
    h.answered_at,
    ROW_NUMBER() OVER (
      PARTITION BY h.user_id, h.question_id
      ORDER BY h.answered_at, h.source, h.row_id
    )::int AS rn
  FROM (
    SELECT t."userId" AS user_id, a."questionId" AS question_id, a.correct,
           a."createdAt" AS answered_at, 0 AS source, a.id AS row_id
    FROM user_answers a
    INNER JOIN exam_attempts t ON t.id = a."attemptId"
    WHERE EXISTS (
      SELECT 1 FROM questions q WHERE q.id = a."questionId" AND q.lang = t.lang
    )
    UNION ALL
    SELECT p."userId", p."questionId", p.correct,
           p."updatedAt", 1, p.id
    FROM practice_answers p
    WHERE p.correct IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM questions q WHERE q.id = p."questionId" AND q.lang = p.lang
      )
  ) h
  WHERE NOT EXISTS (
    SELECT 1 FROM question_progress qp
    WHERE qp."userId" = h.user_id AND qp."questionId" = h.question_id
  )
`;

const ROUND_SQL = `
  WITH up AS (${upsertQuestionProgressSql(`(
    SELECT user_id, question_id, correct, answered_at
    FROM qp_history
    WHERE rn = $1
  )`)}
  )
  SELECT COUNT(*)::int AS n FROM up
`;

function describeTarget(): string {
  const url = process.env.DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
  }
  return `${process.env.PG_HOST || 'localhost'}:${process.env.PG_PORT || '5432'}/${process.env.PG_DATABASE || 'driving_theory_back'}`;
}

async function ensureSchema(
  query: (sql: string) => Promise<unknown>,
): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS question_progress (
      "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      "questionId" integer NOT NULL,
      "wrongCount" integer NOT NULL DEFAULT 0,
      "correctCount" integer NOT NULL DEFAULT 0,
      box smallint NOT NULL DEFAULT 0,
      "reviewsLeft" smallint NOT NULL DEFAULT 0,
      "lastResult" boolean NOT NULL,
      "firstAnsweredAt" timestamptz NOT NULL,
      "lastAnsweredAt" timestamptz NOT NULL,
      "lastReviewedAt" timestamptz NULL,
      "dueAt" timestamptz NULL,
      "clearedAt" timestamptz NULL,
      CONSTRAINT pk_question_progress PRIMARY KEY ("userId", "questionId")
    );
  `);
  // Tables created before "reviewsLeft" existed: give active mistakes the
  // reviews the old box schedule still owed them, within 1..max. Rows already
  // set are skipped, so re-running changes nothing. "correctStreak" was a
  // short-lived dev-only column, never deployed.
  await query(`
    ALTER TABLE question_progress
      ADD COLUMN IF NOT EXISTS "reviewsLeft" smallint NOT NULL DEFAULT 0;
  `);
  await query(`
    UPDATE question_progress
    SET "reviewsLeft" = LEAST(GREATEST(4 - box, 1), ${MISTAKE_MAX_REVIEWS})
    WHERE "dueAt" IS NOT NULL AND "reviewsLeft" = 0;
  `);
  await query(`
    ALTER TABLE question_progress DROP COLUMN IF EXISTS "correctStreak";
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_question_progress_user_due
      ON question_progress ("userId", "dueAt")
      WHERE "dueAt" IS NOT NULL;
  `);
}

async function main() {
  console.log(`target: ${describeTarget()}`);
  const ds = await initPg();
  const qr = ds.createQueryRunner();
  try {
    await qr.connect();
    await ensureSchema((sql) => qr.query(sql));
    console.log('question_progress table + index ready');
    if (!BACKFILL) return;

    await qr.startTransaction();
    await qr.query(HISTORY_SQL);
    await qr.query(`CREATE INDEX ON qp_history (rn)`);
    const [stats] = (await qr.query(`
      SELECT COUNT(*)::int AS answers,
             COUNT(DISTINCT (user_id, question_id))::int AS pairs,
             COALESCE(MAX(rn), 0)::int AS rounds
      FROM qp_history
    `)) as { answers: number; pairs: number; rounds: number }[];
    console.log(
      `history to replay: ${stats.answers} answers, ${stats.pairs} new (user, question) pairs, ${stats.rounds} rounds`,
    );

    if (DRY_RUN) {
      await qr.rollbackTransaction();
      console.log('dry run: nothing written');
      return;
    }

    const started = Date.now();
    for (let round = 1; round <= stats.rounds; round++) {
      const [{ n }] = (await qr.query(ROUND_SQL, [round])) as { n: number }[];
      if (round === 1 || round % 10 === 0 || round === stats.rounds) {
        console.log(`round ${round}/${stats.rounds}: ${n} answers`);
      }
    }
    await qr.commitTransaction();
    console.log(`backfill committed in ${Date.now() - started} ms`);
  } catch (err) {
    if (qr.isTransactionActive) await qr.rollbackTransaction();
    throw err;
  } finally {
    await qr.release();
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
