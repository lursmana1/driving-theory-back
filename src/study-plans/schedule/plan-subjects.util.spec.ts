import { buildLessons } from './lesson.builder.util';
import { buildPlanSubjects } from './plan-subjects.util';
import { buildSchedule } from './schedule.builder.util';
import type { SubjectQuestions } from '../study-plans.types';

const bank: SubjectQuestions[] = [
  { subjectId: 3, questionIds: [1, 2, 3, 4, 5] },
  { subjectId: 4, questionIds: [10, 11, 12] },
  { subjectId: 20, questionIds: [30, 31] },
];
const cards = [
  { id: 'sign-1.1', subjectId: 3 },
  { id: 'sign-1.2', subjectId: 3 },
  { id: 'sign-1.3', subjectId: 3 },
  { id: 'sign-2.1', subjectId: 4 },
  { id: 'sign-9.9', subjectId: 9 },
];
const links = [
  { questionId: 2, cardId: 'sign-1.1' },
  { questionId: 1, cardId: 'sign-1.1' },
  { questionId: 3, cardId: 'sign-1.2' },
  // a subject-4 ticket about a warning sign: taught under the warning card
  { questionId: 10, cardId: 'sign-1.2' },
  { questionId: 11, cardId: 'sign-2.1' },
  // not in this category / unknown card: ignored
  { questionId: 999, cardId: 'sign-1.3' },
  { questionId: 12, cardId: 'sign-x' },
];

describe('buildPlanSubjects', () => {
  const { subjects, cardTickets } = buildPlanSubjects(bank, cards, links);
  const bySubject = new Map(subjects.map((s) => [s.subjectId, s]));

  it('card subjects: cards in order with their tickets, then tickets with no card', () => {
    expect(bySubject.get(3)?.units).toEqual([
      { cardId: 'sign-1.1', questionIds: [1, 2] },
      { cardId: 'sign-1.2', questionIds: [3, 10] },
      { cardId: 'sign-1.3', questionIds: [] },
      { cardId: null, questionIds: [4] },
      { cardId: null, questionIds: [5] },
    ]);
    expect(bySubject.get(3)?.questionIds).toEqual([1, 2, 3, 10, 4, 5]);
  });

  it('a ticket moves to its card subject and leaves its own', () => {
    expect(bySubject.get(4)?.questionIds).toEqual([11, 12]);
    const all = subjects.flatMap((s) => s.questionIds);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(10);
  });

  it('keeps plain subjects as they are, drops card subjects with no ticket', () => {
    expect(bySubject.get(20)).toEqual({ subjectId: 20, questionIds: [30, 31] });
    expect(bySubject.has(9)).toBe(false);
    expect(cardTickets.get('sign-1.2')).toEqual([3, 10]);
  });

  it('lessons never split a card from its tickets', () => {
    const [warning] = buildLessons(subjects, 3);
    expect(warning.map((l) => l.cardIds)).toEqual([
      ['sign-1.1'],
      ['sign-1.2', 'sign-1.3'],
      [],
    ]);
    expect(warning.map((l) => l.questionIds)).toEqual([
      [1, 2],
      [3, 10],
      [4, 5],
    ]);
    expect(warning.every((l) => l.parts === 3)).toBe(true);
  });

  it('teaching-only cards add learn time to the day', () => {
    const plan = buildSchedule({
      subjects,
      dayCount: 3,
      startDay: '2026-11-04',
      examQuestionCount: 30,
    });
    const learn = plan.days[0].steps.filter((s) => s.kind === 'learn');
    expect(learn.some((s) => (s.cardCount ?? 0) > 0)).toBe(true);
    const ids = plan.days
      .flatMap((d) => d.lessons)
      .flatMap((l) => l.questionIds);
    expect(ids.sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 10, 11, 12, 30, 31,
    ]);
  });
});
