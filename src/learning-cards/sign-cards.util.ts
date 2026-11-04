import {
  CARD_GROUP_ORDER_STEP,
  SIGN_GROUP_SUBJECT,
  type CardLang,
} from '../common/constants/learning-cards.constants';

/** One sign in the frontend `signs.json` (only the fields used here). */
export type SourceSign = {
  slug: string;
  kind: 'sign' | 'marking';
  group: number;
  order: number;
  number: string;
  name: string;
  description?: string | null;
  image?: string | null;
};

/** `i18n/<lang>.json`: slug → translated name / description. */
export type SourceSignI18n = Record<
  string,
  { name?: string; description?: string } | undefined
>;

export type CardRow = {
  id: string;
  kind: 'sign' | 'marking';
  subjectId: number;
  order: number;
  image: string | null;
  signNumber: string;
};

export type CardTextRow = {
  cardId: string;
  lang: CardLang;
  title: string;
  body: string | null;
};

/** Markings have no name in the source, only a number: "მონიშვნა 1.1". */
const MARKING_LABEL: Record<CardLang, string> = {
  ka: 'მონიშვნა',
  en: 'Marking',
  ru: 'Разметка',
};

function cardTitle(
  sign: SourceSign,
  lang: CardLang,
  name: string | undefined,
): string | null {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  return sign.kind === 'marking'
    ? `${MARKING_LABEL[lang]} ${sign.number}`
    : null;
}

export function signCardId(kind: string, number: string): string {
  return `${kind}-${number}`;
}

/**
 * Sign JSON → card rows + text rows (ka from the sign itself, en/ru from the
 * i18n files; a missing translation is skipped, not filled with ka).
 * Signs of an unknown group are returned in `skipped`.
 */
export function buildSignCards(
  signs: SourceSign[],
  i18n: Partial<Record<CardLang, SourceSignI18n>>,
): { cards: CardRow[]; texts: CardTextRow[]; skipped: string[] } {
  const cards: CardRow[] = [];
  const texts: CardTextRow[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();

  for (const sign of signs) {
    const subjectId = SIGN_GROUP_SUBJECT[sign.group];
    const id = signCardId(sign.kind, sign.number);
    if (subjectId == null || seen.has(id)) {
      skipped.push(sign.slug);
      continue;
    }
    seen.add(id);
    cards.push({
      id,
      kind: sign.kind,
      subjectId,
      order: sign.group * CARD_GROUP_ORDER_STEP + sign.order,
      image: sign.image ?? null,
      signNumber: sign.number,
    });
    const kaTitle = cardTitle(sign, 'ka', sign.name);
    if (kaTitle) {
      texts.push({
        cardId: id,
        lang: 'ka',
        title: kaTitle,
        body: sign.description?.trim() || null,
      });
    }
    for (const lang of ['en', 'ru'] as const) {
      const t = i18n[lang]?.[sign.slug];
      const title = t ? cardTitle(sign, lang, t.name) : null;
      if (!title) continue;
      texts.push({
        cardId: id,
        lang,
        title,
        body: t?.description?.trim() || null,
      });
    }
  }
  return { cards, texts, skipped };
}
