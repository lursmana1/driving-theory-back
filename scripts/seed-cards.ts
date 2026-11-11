/**
 * Seeds sign / marking cards from the frontend repo's reviewed sign JSON, and
 * rule cards from `src/data/rules/<subjectId>.json` (with their ticket links).
 * The JSON is the source of truth; this is a copy for joins. Only `title` and
 * `body` are written: `tutor` and `audio` (written later by their own
 * scripts) are never touched. Safe to re-run (prints what changed).
 *
 * Rule links are reviewed by hand, so they win: every link of a ticket named
 * in a rule file is replaced, and rule links no longer in the files are removed.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/seed-cards.ts [--dry-run]
 *     [--signs-dir=../prava/src/data/signs] [--rules-dir=../prava/src/data/rules]
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
import {
  buildRuleCards,
  type SourceRuleFile,
} from '../src/learning-cards/rule-cards.util';

const DRY_RUN = process.argv.includes('--dry-run');
const dirArg = process.argv.find((a) => a.startsWith('--signs-dir='));
const SIGNS_DIR = path.resolve(
  dirArg ? dirArg.slice('--signs-dir='.length) : '../prava/src/data/signs',
);

const rulesArg = process.argv.find((a) => a.startsWith('--rules-dir='));
const RULES_DIR = path.resolve(
  rulesArg ? rulesArg.slice('--rules-dir='.length) : '../prava/src/data/rules',
);

function readJson<T>(dir: string, file: string): T {
  return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as T;
}

function readRuleFiles(): SourceRuleFile[] {
  if (!fs.existsSync(RULES_DIR)) return [];
  return fs
    .readdirSync(RULES_DIR)
    .filter((f) => /^\d+\.json$/.test(f))
    .sort((a, b) => parseInt(a) - parseInt(b))
    .map((f) => readJson<SourceRuleFile>(RULES_DIR, f));
}

/** Links replaced by the rule files: every rule link, and any link of a ticket they name. */
const RULE_LINKS_WHERE = `"cardId" IN (SELECT id FROM learning_cards WHERE kind = 'rule')
  OR "questionId" = ANY($1::int[])`;

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
  const { signs } = readJson<{ signs: SourceSign[] }>(SIGNS_DIR, 'signs.json');
  const i18n = {
    en: readJson<SourceSignI18n>(SIGNS_DIR, 'i18n/en.json'),
    ru: readJson<SourceSignI18n>(SIGNS_DIR, 'i18n/ru.json'),
  };
  const sign = buildSignCards(signs, i18n);
  console.log(
    `source ${SIGNS_DIR}: ${signs.length} signs → ${sign.cards.length} cards, ${sign.texts.length} texts` +
      (sign.skipped.length ? `, skipped: ${sign.skipped.join(', ')}` : ''),
  );
  const ruleFiles = readRuleFiles();
  const rule = buildRuleCards(ruleFiles);
  console.log(
    `source ${RULES_DIR}: ${ruleFiles.length} subjects → ${rule.cards.length} cards, ` +
      `${rule.texts.length} texts, ${rule.links.length} ticket links`,
  );
  const cards: CardDbRow[] = [...sign.cards, ...rule.cards];
  const texts: TextDbRow[] = [...sign.texts, ...rule.texts];

  const ds = await initPg();
  try {
    const oldCards = new Map(
      (
        await ds.query<CardDbRow[]>(
          `SELECT id, kind, "subjectId", "order", image, "signNumber" FROM learning_cards WHERE kind IN ('sign', 'marking', 'rule')`,
        )
      ).map((r) => [r.id, r]),
    );
    const oldTexts = new Map(
      (
        await ds.query<TextDbRow[]>(
          `SELECT t."cardId", t.lang, t.title, t.body FROM learning_card_texts t
           JOIN learning_cards c ON c.id = t."cardId" WHERE c.kind IN ('sign', 'marking', 'rule')`,
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
    // A rule card dropped from its file must not linger as an empty card in
    // plans; stale sign cards are only reported.
    const staleRules: string[] = [];
    const staleSigns: string[] = [];
    for (const o of oldCards.values()) {
      if (!newIds.has(o.id)) {
        (o.kind === 'rule' ? staleRules : staleSigns).push(o.id);
      }
    }
    console.log(
      `cards: ${cardChanges.length} new/changed of ${cards.length}; texts: ${textChanges.length} new/changed of ${texts.length}` +
        (staleSigns.length
          ? `; in DB but not in JSON (left alone): ${staleSigns.join(', ')}`
          : '') +
        (staleRules.length
          ? `; rule cards removed: ${staleRules.join(', ')}`
          : ''),
    );
    const ruleQuestionIds = rule.links.map((l) => l.questionId);
    const [{ n: replacedLinks }] = await ds.query<{ n: string }[]>(
      `SELECT count(*) AS n FROM question_cards
       WHERE ${RULE_LINKS_WHERE}`,
      [ruleQuestionIds],
    );
    console.log(
      `rule links: ${rule.links.length} to write, ${replacedLinks} existing replaced`,
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
      // Rule links: hand-reviewed, the files win for every ticket they name.
      await tx.query(
        `DELETE FROM question_cards
         WHERE ${RULE_LINKS_WHERE}`,
        [ruleQuestionIds],
      );
      if (staleRules.length > 0) {
        await tx.query(
          `DELETE FROM learning_card_texts WHERE "cardId" = ANY($1::varchar[])`,
          [staleRules],
        );
        await tx.query(
          `DELETE FROM learning_cards WHERE id = ANY($1::varchar[])`,
          [staleRules],
        );
      }
      if (rule.links.length > 0) {
        await tx.query(
          `INSERT INTO question_cards ("questionId", "cardId", "primary", source, confirmed)
           SELECT * FROM unnest($1::int[], $2::varchar[], $3::boolean[], $4::varchar[], $5::boolean[])`,
          [
            ruleQuestionIds,
            rule.links.map((l) => l.cardId),
            rule.links.map((l) => l.primary),
            rule.links.map((l) => l.source),
            rule.links.map((l) => l.confirmed),
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
