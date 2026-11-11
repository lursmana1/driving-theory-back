import type { LessonUnit, SubjectQuestions } from '../study-plans.types.js';

/** A card in its subject's teaching order. */
export type CardRef = { id: string; subjectId: number };

/** A ticket's primary card (confirmed links only). */
export type PrimaryLink = { questionId: number; cardId: string };

export type PlanSubjects = {
  /** The plan input: card subjects carry `units`. Frozen, shared. */
  subjects: readonly SubjectQuestions[];
  /** Card id → its tickets in this category, ids ascending. */
  cardTickets: ReadonlyMap<string, readonly number[]>;
};

/**
 * Pure: the category's tickets by subject + the cards → the plan input.
 *
 * A ticket is taught under its primary card, even when the ticket's own
 * subject is another one (a priority-signs ticket about a warning sign), so
 * it moves to the card's subject and leaves its own. A card subject is its
 * cards in order (a card with no ticket here still teaches), then its
 * tickets with no card, one unit each. A card subject with no ticket in the
 * category is left out: its signs are not on this category's exam.
 */
export function buildPlanSubjects(
  bank: readonly SubjectQuestions[],
  cards: readonly CardRef[],
  links: readonly PrimaryLink[],
): PlanSubjects {
  const inCategory = new Set(bank.flatMap((s) => s.questionIds));
  const cardIds = new Set(cards.map((c) => c.id));
  const cardTickets = new Map<string, number[]>();
  const claimed = new Set<number>();
  for (const { questionId, cardId } of links) {
    if (!inCategory.has(questionId) || !cardIds.has(cardId)) continue;
    if (claimed.has(questionId)) continue; // one primary card per ticket
    claimed.add(questionId);
    const list = cardTickets.get(cardId) ?? [];
    list.push(questionId);
    cardTickets.set(cardId, list);
  }
  for (const list of cardTickets.values()) list.sort((a, b) => a - b);

  const cardsBySubject = new Map<number, string[]>();
  for (const card of cards) {
    const list = cardsBySubject.get(card.subjectId) ?? [];
    list.push(card.id);
    cardsBySubject.set(card.subjectId, list);
  }

  const ownIds = new Map(bank.map((s) => [s.subjectId, s.questionIds]));
  const subjectIds = [...new Set([...ownIds.keys(), ...cardsBySubject.keys()])];
  const subjects: SubjectQuestions[] = [];
  for (const subjectId of subjectIds) {
    const unclaimed = (ownIds.get(subjectId) ?? []).filter(
      (id) => !claimed.has(id),
    );
    const subjectCards = cardsBySubject.get(subjectId);
    if (!subjectCards) {
      if (unclaimed.length) {
        subjects.push({ subjectId, questionIds: Object.freeze(unclaimed) });
      }
      continue;
    }
    const units: LessonUnit[] = [
      ...subjectCards.map((cardId) => ({
        cardId,
        questionIds: Object.freeze(cardTickets.get(cardId) ?? []),
      })),
      ...[...unclaimed]
        .sort((a, b) => a - b)
        .map((id) => ({ cardId: null, questionIds: Object.freeze([id]) })),
    ];
    const questionIds = units.flatMap((u) => u.questionIds);
    if (questionIds.length === 0) continue;
    subjects.push({
      subjectId,
      questionIds: Object.freeze(questionIds),
      units: Object.freeze(units.map((u) => Object.freeze(u))),
    });
  }
  return {
    subjects: Object.freeze(subjects.map((s) => Object.freeze(s))),
    cardTickets,
  };
}
