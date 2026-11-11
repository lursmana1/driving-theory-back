import {
  buildLessons,
  lessonSizeFor,
  orderSubjects,
} from './lesson.builder.util';
import {
  buildSchedule,
  interleaveLessons,
  reviewDayCount,
  splitLessonsByTime,
} from './schedule.builder.util';
import type { SubjectQuestions } from '../study-plans.types';

/** Fake bank: `count` questions per subject, ids unique across subjects. */
function bank(counts: Record<number, number>): SubjectQuestions[] {
  let next = 1;
  return Object.entries(counts).map(([subject, count]) => ({
    subjectId: Number(subject),
    questionIds: Array.from({ length: count }, () => next++),
  }));
}

/** Roughly category B: ~900 questions over 32 subjects. */
const B_LIKE = bank(
  Object.fromEntries(
    Array.from({ length: 32 }, (_, i) => [i + 1, 20 + (i % 9) * 4]),
  ),
);

function build(dayCount: number, subjects = B_LIKE) {
  return buildSchedule({
    subjects,
    dayCount,
    startDay: '2026-11-04',
    examQuestionCount: 30,
  });
}

function allLessonIds(dayCount: number, subjects = B_LIKE): number[] {
  return build(dayCount, subjects)
    .days.flatMap((d) => d.lessons)
    .flatMap((l) => l.questionIds);
}

describe('lesson builder', () => {
  it('orders subjects by teaching order (warning signs first), unknown last', () => {
    const ordered = orderSubjects(bank({ 99: 3, 20: 3, 3: 3, 4: 3 }));
    expect(ordered.map((s) => s.subjectId)).toEqual([3, 4, 20, 99]);
  });

  it('drops empty subjects and duplicate ids', () => {
    const ordered = orderSubjects([
      { subjectId: 3, questionIds: [5, 2, 5] },
      { subjectId: 4, questionIds: [] },
    ]);
    expect(ordered).toEqual([
      {
        subjectId: 3,
        units: [
          { cardId: null, questionIds: [2] },
          { cardId: null, questionIds: [5] },
        ],
      },
    ]);
  });

  it('keeps lesson size within 6..14', () => {
    expect(lessonSizeFor(1)).toBe(6);
    expect(lessonSizeFor(40)).toBe(10);
    expect(lessonSizeFor(500)).toBe(14);
  });

  it('splits a subject into near-equal lessons no bigger than the size', () => {
    const [lessons] = buildLessons(bank({ 3: 30 }), 14);
    expect(lessons.map((l) => l.questionIds.length)).toEqual([10, 10, 10]);
    expect(lessons.map((l) => l.id)).toEqual(['3-1', '3-2', '3-3']);
    expect(lessons[0]).toMatchObject({ part: 1, parts: 3 });
  });

  it('interleaves a window of neighbouring subjects', () => {
    const lessons = interleaveLessons(
      buildLessons(bank({ 3: 12, 4: 12, 5: 6, 6: 6 }), 6),
    );
    expect(lessons.map((l) => l.id)).toEqual([
      '3-1',
      '4-1',
      '5-1',
      '6-1',
      '3-2',
      '4-2',
    ]);
  });
});

describe('schedule builder', () => {
  it.each([
    [3, 1],
    [7, 2],
    [14, 2],
    [28, 4],
    [60, 9],
  ])('%i days → %i review days', (days, review) => {
    expect(reviewDayCount(days)).toBe(review);
  });

  it.each([7, 14, 28, 3, 60])(
    '%i days: every question exactly once, review days at the end',
    (days) => {
      const plan = build(days);
      expect(plan.days).toHaveLength(days);
      const ids = allLessonIds(days);
      expect(ids).toHaveLength(plan.totalQuestions);
      expect(new Set(ids).size).toBe(plan.totalQuestions);
      const kinds = plan.days.map((d) => d.kind);
      expect(kinds.lastIndexOf('learn')).toBeLessThan(kinds.indexOf('review'));
      expect(plan.days.filter((d) => d.kind === 'learn')).toHaveLength(
        plan.learnDays,
      );
      expect(plan.days.every((d) => d.minutes > 0)).toBe(true);
    },
  );

  it('dates follow the start day', () => {
    const plan = build(14);
    expect(plan.days[0].date).toBe('2026-11-04');
    expect(plan.days[13].date).toBe('2026-11-17');
  });

  it('day steps: learn per lesson, review from day 2, test, a mock every 3rd learn day', () => {
    const plan = build(14);
    const kinds = (i: number) => plan.days[i].steps.map((s) => s.kind);
    expect(kinds(0)).not.toContain('review');
    expect(kinds(0)).toContain('test');
    expect(kinds(1)).toContain('review');
    expect(kinds(2)).toContain('exam');
    expect(kinds(13)).toEqual(['review', 'exam']);
    const test = plan.days[0].steps.find((s) => s.kind === 'test');
    expect(test?.questionCount).toBeLessThanOrEqual(30);
  });

  it('more learn days than lessons: extra days become review days', () => {
    const plan = build(28, bank({ 3: 12, 4: 6 }));
    expect(plan.learnDays).toBe(3);
    expect(plan.days.filter((d) => d.kind === 'learn')).toHaveLength(3);
    expect(
      plan.days.every((d) => d.kind === 'review' || d.lessons.length > 0),
    ).toBe(true);
  });

  it('is stable: same input → same lessons', () => {
    expect(build(14).days).toEqual(build(14).days);
  });

  it('7 days carries a far bigger daily dose than 28', () => {
    const avg = (days: number) => {
      const plan = build(days);
      return plan.totalQuestions / plan.learnDays;
    };
    expect(avg(7)).toBeGreaterThan(avg(28) * 4);
  });
});

describe('splitLessonsByTime', () => {
  const lesson = (id: string, questions: number, cards = 0) => ({
    id,
    subjectId: 3,
    part: 1,
    parts: 1,
    questionIds: Array.from({ length: questions }, (_, i) => i),
    cardIds: Array.from({ length: cards }, (_, i) => `c${i}`),
  });

  it('gives card-heavy lessons fewer per day', () => {
    const lessons = [
      lesson('a', 10, 10),
      lesson('b', 10, 10),
      lesson('c', 10),
      lesson('d', 10),
      lesson('e', 10),
      lesson('f', 10),
    ];
    const days = splitLessonsByTime(lessons, 3);
    expect(days.map((d) => d.map((l) => l.id))).toEqual([
      ['a'],
      ['b', 'c'],
      ['d', 'e', 'f'],
    ]);
  });

  it('never leaves a day empty', () => {
    const days = splitLessonsByTime(
      [lesson('a', 14, 14), lesson('b', 1), lesson('c', 1)],
      3,
    );
    expect(days.every((d) => d.length > 0)).toBe(true);
  });
});
