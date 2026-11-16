/**
 * Hand-made ticket → sign card links from the frontend repo's
 * `src/data/signs/manual-links.json`: `{ "<questionId>": ["sign-…", …] }`,
 * the first card being the primary one. For tickets whose text names a
 * sign the regex cannot resolve (a card that covers a numbered range such
 * as `sign-8.1.1–8.1.4`, or a number followed by the sign's quoted name).
 */
export type SourceManualSignLinks = Record<string, string[]>;

export type ManualSignLinkRow = {
  questionId: number;
  cardId: string;
  primary: boolean;
  source: 'manual';
  confirmed: true;
};

const QUESTION_ID = /^[1-9]\d{0,6}$/;

/**
 * Link rows for every listed ticket. Throws on a broken file (so a bad edit
 * never half-seeds): a non-numeric ticket id, an empty list, a card that is
 * not a known sign / marking card, or the same card twice for one ticket.
 */
export function buildManualSignLinks(
  source: SourceManualSignLinks,
  knownCardIds: ReadonlySet<string>,
): ManualSignLinkRow[] {
  const rows: ManualSignLinkRow[] = [];
  for (const [key, cardIds] of Object.entries(source)) {
    if (!QUESTION_ID.test(key)) {
      throw new Error(`manual-links: bad ticket id "${key}"`);
    }
    if (!Array.isArray(cardIds) || cardIds.length === 0) {
      throw new Error(`manual-links: ticket ${key} has no cards`);
    }
    const seen = new Set<string>();
    cardIds.forEach((cardId, i) => {
      if (!knownCardIds.has(cardId)) {
        throw new Error(
          `manual-links: ticket ${key}: unknown card "${cardId}"`,
        );
      }
      if (seen.has(cardId)) {
        throw new Error(`manual-links: ticket ${key} lists "${cardId}" twice`);
      }
      seen.add(cardId);
      rows.push({
        questionId: Number(key),
        cardId,
        primary: i === 0,
        source: 'manual',
        confirmed: true,
      });
    });
  }
  return rows;
}
