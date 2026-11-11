/**
 * Sign group (frontend `src/data/signs/signs.json` → `groups[].id`) → the
 * ticket subject whose lessons teach it. Measured on the B tickets
 * (2026-11-04): each group's sign numbers appear mostly in that subject.
 * Groups 5 (special instructions) and 7 (information) are both subject 7
 * "საინფორმაციო-მაჩვენებელი"; group 8 is subject 9 "დამატებითი ინფორმაციის".
 */
export const SIGN_GROUP_SUBJECT: Readonly<Record<number, number>> = {
  1: 3,
  2: 4,
  3: 5,
  4: 6,
  5: 7,
  6: 8,
  7: 7,
  8: 9,
  101: 28,
};

/** Subjects whose tickets are about signs / markings (regex links apply). */
export const SIGN_SUBJECT_IDS: readonly number[] = [3, 4, 5, 6, 7, 8, 9, 28];

export const CARD_LANGS = ['ka', 'en', 'ru'] as const;
export type CardLang = (typeof CARD_LANGS)[number];

/** Order step between sign groups, so a group's signs stay together. */
export const CARD_GROUP_ORDER_STEP = 1000;
