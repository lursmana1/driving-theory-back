/**
 * Finds sign / marking numbers in Georgian ticket text. Same rule as the
 * frontend `splitSignRefs` (prava `src/utills/helpers/signLinks.ts`): a
 * number only counts when the word next to it says "sign" / "marking", so
 * "დანართის 4.3 პუნქტის" (a paragraph of the law) is not sign 4.3.
 */

export type SignRef = { kind: 'sign' | 'marking'; number: string; at: number };

const NUM = String.raw`\d{1,2}(?:\.\d{1,2}){1,2}`;
/** `matchAll` clones a global regex, so module-level ones are safe to share. */
const NUM_RE = new RegExp(NUM, 'g');
/** "2.3", "2.3 და 2.4", "5.11, 5.13.1 და 5.14", "4.1.1-4.1.6" */
const LIST = String.raw`${NUM}\.?(?:\s*(?:,|და|ან|-|–|−)\s*${NUM}\.?)*`;
const SIGN_WORD = String.raw`(?:ნიშან|ნიშნ)[ა-ჰ]*`;
const MARKING_WORD = String.raw`მონიშვნ[ა-ჰ]*`;

const PATTERNS: [SignRef['kind'], RegExp][] = [
  ['sign', new RegExp(String.raw`(?<=(?:${SIGN_WORD})\s+)${LIST}`, 'g')],
  [
    'sign',
    new RegExp(String.raw`${LIST}(?=\s+(?:საგზაო\s+)?(?:${SIGN_WORD}))`, 'g'),
  ],
  ['marking', new RegExp(String.raw`(?<=(?:${MARKING_WORD})\s+)${LIST}`, 'g')],
  ['marking', new RegExp(String.raw`${LIST}(?=\s+(?:${MARKING_WORD}))`, 'g')],
];

/** Every sign / marking number in `text`, in reading order, no duplicates. */
export function findSignRefs(text: string | null | undefined): SignRef[] {
  if (!text) return [];
  const hits: SignRef[] = [];
  for (const [kind, re] of PATTERNS) {
    for (const list of text.matchAll(re)) {
      for (const n of list[0].matchAll(NUM_RE)) {
        hits.push({
          kind,
          number: n[0],
          at: (list.index ?? 0) + (n.index ?? 0),
        });
      }
    }
  }
  hits.sort((a, b) => a.at - b.at);
  const seen = new Set<string>();
  return hits.filter((h) => {
    const key = `${h.kind}:${h.number}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
