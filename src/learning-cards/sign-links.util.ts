import { SIGN_SUBJECT_IDS } from '../common/constants/learning-cards.constants';
import { signCardId } from './sign-cards.util';
import { findSignRefs } from './sign-refs.util';

export type LinkSourceQuestion = {
  id: number;
  subject: number | null;
  question: string | null;
  question_explained: string | null;
};

export type QuestionCardRow = {
  questionId: number;
  cardId: string;
  primary: boolean;
  source: 'regex';
  confirmed: boolean;
};

/** Known card ids named in `text`, in reading order. */
function cardIdsIn(
  text: string | null,
  knownCardIds: ReadonlySet<string>,
): string[] {
  return findSignRefs(text)
    .map((r) => signCardId(r.kind, r.number))
    .filter((id) => knownCardIds.has(id));
}

const SIGN_SUBJECTS: ReadonlySet<number> = new Set(SIGN_SUBJECT_IDS);

/**
 * Regex links for tickets in sign subjects. Numbers that are not a known card
 * are ignored. Primary card = the first sign named in the question; if the
 * question names none, the first one in the explanation. Confirmed, because
 * the sign is named in the ticket's own text.
 */
export function buildSignLinks(
  questions: LinkSourceQuestion[],
  knownCardIds: ReadonlySet<string>,
): { links: QuestionCardRow[]; unlinked: number[] } {
  const links: QuestionCardRow[] = [];
  const unlinked: number[] = [];
  for (const q of questions) {
    if (q.subject == null || !SIGN_SUBJECTS.has(q.subject)) continue;
    const fromQuestion = cardIdsIn(q.question, knownCardIds);
    const all = [
      ...new Set([
        ...fromQuestion,
        ...cardIdsIn(q.question_explained, knownCardIds),
      ]),
    ];
    if (all.length === 0) {
      unlinked.push(q.id);
      continue;
    }
    const primary = fromQuestion[0] ?? all[0];
    for (const cardId of all) {
      links.push({
        questionId: q.id,
        cardId,
        primary: cardId === primary,
        source: 'regex',
        confirmed: true,
      });
    }
  }
  return { links, unlinked };
}
