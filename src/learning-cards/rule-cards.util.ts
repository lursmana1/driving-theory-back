import {
  CARD_LANGS,
  SIGN_SUBJECT_IDS,
  type CardLang,
} from '../common/constants/learning-cards.constants';
import type { CardRow, CardTextRow } from './sign-cards.util';

/**
 * One rule-topic file in the frontend repo: `src/data/rules/<subjectId>.json`.
 * Written from the subject's real tickets and reviewed by the owner; the
 * database is a seeded copy.
 */
export type SourceRuleFile = {
  subjectId: number;
  cards: {
    /** "rule-24-rope"; unique across all files. */
    id: string;
    order: number;
    image?: string | null;
    /** ka is required; en / ru are added after the ka text is approved. */
    text: Partial<Record<CardLang, { title: string; body: string }>>;
    /** Tickets taught under this card (every category). */
    questions: number[];
  }[];
};

export type RuleLinkRow = {
  questionId: number;
  cardId: string;
  primary: true;
  source: 'manual';
  confirmed: true;
};

const RULE_ID = /^rule-\d+-[a-z0-9-]+$/;

/**
 * Rule files → card, text and link rows. Throws on a broken file (so a bad
 * edit never half-seeds): a sign subject, a bad / duplicate id, a missing ka
 * text, or a ticket under two cards.
 */
export function buildRuleCards(files: SourceRuleFile[]): {
  cards: CardRow[];
  texts: CardTextRow[];
  links: RuleLinkRow[];
} {
  const cards: CardRow[] = [];
  const texts: CardTextRow[] = [];
  const links: RuleLinkRow[] = [];
  const cardOf = new Map<number, string>();

  for (const file of files) {
    if (SIGN_SUBJECT_IDS.includes(file.subjectId)) {
      throw new Error(`rules: subject ${file.subjectId} is a sign subject`);
    }
    for (const card of file.cards) {
      if (
        !RULE_ID.test(card.id) ||
        !card.id.startsWith(`rule-${file.subjectId}-`)
      ) {
        throw new Error(
          `rules: bad card id "${card.id}" in subject ${file.subjectId}`,
        );
      }
      if (cards.some((c) => c.id === card.id)) {
        throw new Error(`rules: duplicate card id "${card.id}"`);
      }
      if (!card.text.ka?.title.trim() || !card.text.ka.body.trim()) {
        throw new Error(`rules: "${card.id}" has no ka title / body`);
      }
      cards.push({
        id: card.id,
        kind: 'rule',
        subjectId: file.subjectId,
        order: card.order,
        image: card.image ?? null,
        signNumber: null,
      });
      for (const lang of CARD_LANGS) {
        const t = card.text[lang];
        if (t?.title.trim() && t.body.trim()) {
          texts.push({
            cardId: card.id,
            lang,
            title: t.title.trim(),
            body: t.body.trim(),
          });
        }
      }
      for (const questionId of card.questions) {
        const other = cardOf.get(questionId);
        if (other) {
          throw new Error(
            `rules: ticket ${questionId} is under both "${other}" and "${card.id}"`,
          );
        }
        cardOf.set(questionId, card.id);
        links.push({
          questionId,
          cardId: card.id,
          primary: true,
          source: 'manual',
          confirmed: true,
        });
      }
    }
  }
  return { cards, texts, links };
}
