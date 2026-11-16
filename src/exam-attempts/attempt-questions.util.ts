import type { Question } from '../questions/entities/question.entity';

/**
 * A question as shown in a past attempt. `archived` is true when the question
 * has since been moved to `questions_archived` (no longer in the official
 * bank) and was loaded from there so the attempt stays complete.
 */
export type AttemptQuestion = Question & { archived: boolean };

/** Ticket ids that were not found among the live questions. */
export function missingQuestionIds(
  ids: readonly number[],
  found: readonly Pick<Question, 'id'>[],
): number[] {
  const foundIds = new Set(found.map((q) => q.id));
  return [...new Set(ids.filter((id) => !foundIds.has(id)))];
}

/**
 * Ticket order from `ids`. Live questions win over archived ones; ids found
 * in neither table are left out.
 */
export function orderAttemptQuestions(
  ids: readonly number[],
  live: readonly Question[],
  archived: readonly Question[],
): AttemptQuestion[] {
  const byId = new Map<number, AttemptQuestion>();
  for (const q of archived) byId.set(q.id, { ...q, archived: true });
  for (const q of live) byId.set(q.id, { ...q, archived: false });
  return ids
    .map((id) => byId.get(id))
    .filter((q): q is AttemptQuestion => q != null);
}
