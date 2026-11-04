/**
 * Links tickets in sign subjects to sign / marking cards, from the sign
 * numbers named in the ticket's own Georgian text (question + explanation).
 * Replaces earlier `regex` links; questions that have any `gemini` or
 * `manual` link are left alone. Safe to re-run.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/link-sign-cards.ts [--dry-run]
 */
import 'dotenv/config';
import { initPg } from './lib/pg-data-source';
import {
  buildSignLinks,
  type LinkSourceQuestion,
} from '../src/learning-cards/sign-links.util';
import { SIGN_SUBJECT_IDS } from '../src/common/constants/learning-cards.constants';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const ds = await initPg();
  try {
    const known = new Set(
      (
        await ds.query<{ id: string }[]>(
          `SELECT id FROM learning_cards WHERE kind IN ('sign', 'marking')`,
        )
      ).map((r) => r.id),
    );
    if (known.size === 0) {
      console.log('no sign cards yet: run db:seed-cards first');
      return;
    }
    const questions = await ds.query<LinkSourceQuestion[]>(
      `SELECT id, subject, question, question_explained FROM questions
       WHERE lang = 'ka' AND subject = ANY($1::int[]) ORDER BY id`,
      [SIGN_SUBJECT_IDS],
    );
    const handEdited = new Set(
      (
        await ds.query<{ questionId: number }[]>(
          `SELECT DISTINCT "questionId" FROM question_cards WHERE source <> 'regex'`,
        )
      ).map((r) => Number(r.questionId)),
    );
    const { links, unlinked } = buildSignLinks(
      questions.filter((q) => !handEdited.has(Number(q.id))),
      known,
    );
    const linkedQuestions = new Set(links.map((l) => l.questionId)).size;
    console.log(
      `sign-subject tickets: ${questions.length}; linked: ${linkedQuestions} (${links.length} links); ` +
        `without a card: ${unlinked.length}; kept hand-edited: ${handEdited.size}`,
    );
    if (unlinked.length) {
      console.log(`without a card (ids): ${unlinked.join(', ')}`);
    }
    if (DRY_RUN) {
      console.log('dry run: nothing written');
      return;
    }

    // One multi-row insert (unnest of column arrays) inside the transaction.
    const inserted = await ds.transaction(async (tx) => {
      await tx.query(`DELETE FROM question_cards WHERE source = 'regex'`);
      if (links.length === 0) return 0;
      const rows = await tx.query<unknown[]>(
        `INSERT INTO question_cards ("questionId", "cardId", "primary", source, confirmed)
         SELECT * FROM unnest($1::int[], $2::varchar[], $3::boolean[], $4::varchar[], $5::boolean[])
         ON CONFLICT ("questionId", "cardId") DO NOTHING
         RETURNING 1`,
        [
          links.map((l) => l.questionId),
          links.map((l) => l.cardId),
          links.map((l) => l.primary),
          links.map((l) => l.source),
          links.map((l) => l.confirmed),
        ],
      );
      return rows.length;
    });
    const skipped = links.length - inserted;
    console.log(
      `linked: ${inserted} rows written` +
        (skipped ? `; ${skipped} already present (skipped)` : ''),
    );
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
