/**
 * Seeds sign / marking cards from the frontend repo's reviewed sign JSON.
 * The JSON is the source of truth; this is a copy for joins. Only `title` and
 * `body` are written: `tutor` and `audio` (written later by their own
 * scripts) are never touched. Safe to re-run (prints what changed).
 *
 *   npx ts-node -r tsconfig-paths/register scripts/seed-cards.ts [--dry-run]
 *     [--signs-dir=../prava/src/data/signs]
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { initPg } from './lib/pg-data-source';
import {
  buildSignCards,
  type SourceSign,
  type SourceSignI18n,
} from '../src/learning-cards/sign-cards.util';

const DRY_RUN = process.argv.includes('--dry-run');
const dirArg = process.argv.find((a) => a.startsWith('--signs-dir='));
const SIGNS_DIR = path.resolve(
  dirArg ? dirArg.slice('--signs-dir='.length) : '../prava/src/data/signs',
);

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(SIGNS_DIR, file), 'utf8')) as T;
}

type CardDbRow = {
  id: string;
  kind: string;
  subjectId: number;
  order: number;
  image: string | null;
  signNumber: string | null;
};
type TextDbRow = {
  cardId: string;
  lang: string;
  title: string;
  body: string | null;
};

async function main() {
  const { signs } = readJson<{ signs: SourceSign[] }>('signs.json');
  const i18n = {
    en: readJson<SourceSignI18n>('i18n/en.json'),
    ru: readJson<SourceSignI18n>('i18n/ru.json'),
  };
  const { cards, texts, skipped } = buildSignCards(signs, i18n);
  console.log(
    `source ${SIGNS_DIR}: ${signs.length} signs → ${cards.length} cards, ${texts.length} texts` +
      (skipped.length ? `, skipped: ${skipped.join(', ')}` : ''),
  );

  const ds = await initPg();
  try {
    const oldCards = new Map(
      (
        await ds.query<CardDbRow[]>(
          `SELECT id, kind, "subjectId", "order", image, "signNumber" FROM learning_cards WHERE kind IN ('sign', 'marking')`,
        )
      ).map((r) => [r.id, r]),
    );
    const oldTexts = new Map(
      (
        await ds.query<TextDbRow[]>(
          `SELECT t."cardId", t.lang, t.title, t.body FROM learning_card_texts t
           JOIN learning_cards c ON c.id = t."cardId" WHERE c.kind IN ('sign', 'marking')`,
        )
      ).map((r) => [`${r.cardId}|${r.lang}`, r]),
    );

    const cardChanges = cards.filter((c) => {
      const o = oldCards.get(c.id);
      return (
        !o ||
        o.kind !== c.kind ||
        Number(o.subjectId) !== c.subjectId ||
        Number(o.order) !== c.order ||
        o.image !== c.image ||
        o.signNumber !== c.signNumber
      );
    });
    const textChanges = texts.filter((t) => {
      const o = oldTexts.get(`${t.cardId}|${t.lang}`);
      return !o || o.title !== t.title || o.body !== t.body;
    });
    const newIds = new Set(cards.map((c) => c.id));
    const stale = [...oldCards.keys()].filter((id) => !newIds.has(id));
    console.log(
      `cards: ${cardChanges.length} new/changed of ${cards.length}; texts: ${textChanges.length} new/changed of ${texts.length}` +
        (stale.length
          ? `; in DB but not in JSON (left alone): ${stale.join(', ')}`
          : ''),
    );
    if (DRY_RUN) {
      console.log('dry run: nothing written');
      return;
    }

    // One multi-row upsert per table (unnest of column arrays). Ids are
    // unique in `cards` / `texts` (buildSignCards dedupes), which ON CONFLICT
    // DO UPDATE requires. Cards first: texts reference them.
    await ds.transaction(async (tx) => {
      if (cardChanges.length > 0) {
        await tx.query(
          `INSERT INTO learning_cards (id, kind, "subjectId", "order", image, "signNumber", "updatedAt")
           SELECT id, kind, "subjectId", "order", image, "signNumber", now()
           FROM unnest($1::varchar[], $2::varchar[], $3::smallint[], $4::int[], $5::varchar[], $6::varchar[])
             AS u(id, kind, "subjectId", "order", image, "signNumber")
           ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, "subjectId" = EXCLUDED."subjectId",
             "order" = EXCLUDED."order", image = EXCLUDED.image, "signNumber" = EXCLUDED."signNumber",
             "updatedAt" = now()`,
          [
            cardChanges.map((c) => c.id),
            cardChanges.map((c) => c.kind),
            cardChanges.map((c) => c.subjectId),
            cardChanges.map((c) => c.order),
            cardChanges.map((c) => c.image),
            cardChanges.map((c) => c.signNumber),
          ],
        );
      }
      if (textChanges.length > 0) {
        await tx.query(
          `INSERT INTO learning_card_texts ("cardId", lang, title, body)
           SELECT * FROM unnest($1::varchar[], $2::varchar[], $3::text[], $4::text[])
           ON CONFLICT ("cardId", lang) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body`,
          [
            textChanges.map((t) => t.cardId),
            textChanges.map((t) => t.lang),
            textChanges.map((t) => t.title),
            textChanges.map((t) => t.body),
          ],
        );
      }
    });
    console.log('seeded');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
