import {
  buildLessons,
  lessonSizeFor,
  orderSubjects,
} from './lesson.builder.util';
import {
  buildSchedule,
  interleaveLessons,
  daysForTargetMinutes,
  dayExamParts,
  spreadOptional,
  planDepthFor,
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
    [7, 1],
    [14, 1],
    [27, 1],
    [28, 2],
    [39, 2],
    [40, 3],
    [60, 3],
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
    expect(kinds(13)).toEqual(['review', 'exam', 'exam']);
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
    restIds: [] as number[],
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

describe('cards, extras and mocks', () => {
  /** One card subject: 6 cards with 4 tickets each, ids 1..24. */
  const cardSubject: SubjectQuestions = {
    subjectId: 3,
    questionIds: Array.from({ length: 24 }, (_, i) => i + 1),
    units: Array.from({ length: 6 }, (_, c) => ({
      cardId: `sign-${c}`,
      questionIds: [1, 2, 3, 4].map((n) => c * 4 + n),
    })),
  };
  const subjectsWithCards: SubjectQuestions[] = [
    cardSubject,
    ...bank({ 20: 30 }).map((s) => ({
      ...s,
      questionIds: s.questionIds.map((id) => id + 100),
    })),
  ];
  const buildWith = (dayCount: number) =>
    buildSchedule({
      subjects: subjectsWithCards,
      dayCount,
      startDay: '2026-11-04',
      examQuestionCount: 30,
    });
  /** Full mode (over 21 days). */
  const plan = buildWith(22);

  it('a lesson teaches 2 tickets per card; the rest come in the next day exam', () => {
    const lessons = plan.days
      .flatMap((d) => d.lessons)
      .filter((l) => l.subjectId === 3);
    expect(lessons.flatMap((l) => l.questionIds)).toHaveLength(12);
    expect(lessons.flatMap((l) => l.restIds)).toHaveLength(12);
    for (let i = 1; i < plan.days.length; i++) {
      const prev = plan.days[i - 1].lessons.flatMap((l) => l.restIds);
      expect(plan.days[i].carryIds).toEqual(prev);
    }
    // every ticket is met once: taught or carried
    const met = plan.days.flatMap((d) => [
      ...d.carryIds,
      ...d.lessons.flatMap((l) => l.questionIds),
    ]);
    expect(new Set(met).size).toBe(54);
    expect(met).toHaveLength(54);
  });

  it('a learn day ends with the mixed day exam; full mock every 3rd learn day', () => {
    const learn = plan.days.filter((d) => d.kind === 'learn');
    learn.forEach((d, i) => {
      const kinds = d.steps.map((s) => s.kind);
      expect(kinds).not.toContain('mix');
      expect(kinds.includes('exam')).toBe((i + 1) % 3 === 0);
      const test = d.steps.find((s) => s.kind === 'test');
      if (test) {
        expect(test.questionCount).toBeGreaterThanOrEqual(d.carryIds.length);
      }
    });
  });

  it('review days: last extras, mistakes review, two full mocks', () => {
    for (const d of plan.days.filter((x) => x.kind === 'review')) {
      expect(d.steps.map((s) => s.kind)).toEqual(
        d.carryIds.length
          ? ['mix', 'review', 'exam', 'exam']
          : ['review', 'exam', 'exam'],
      );
    }
  });

  it('short plans (≤ 21 days) teach 1 ticket per card, the rest optional', () => {
    const short = buildWith(7);
    expect(short.mode).toBe('short');
    expect(plan.mode).toBe('full');
    const lessons = short.days
      .flatMap((d) => d.lessons)
      .filter((l) => l.subjectId === 3);
    expect(lessons.flatMap((l) => l.questionIds)).toHaveLength(6);
    // the other tickets stay on the lesson but go to the optional rounds, not carry
    expect(lessons.flatMap((l) => l.restIds)).toHaveLength(18);
    expect(short.optionalQuestions).toBe(18);
    expect(short.days.every((d) => d.carryIds.length === 0)).toBe(true);
    // the optional `extra` step holds them, last in the day, not in the minutes
    const extras = short.days.flatMap((d) =>
      d.steps.filter((s) => s.kind === 'extra'),
    );
    expect(extras.reduce((n, s) => n + s.questionCount, 0)).toBe(18);
    for (const d of short.days) {
      const i = d.steps.findIndex((s) => s.kind === 'extra');
      if (i !== -1) expect(i).toBe(d.steps.length - 1);
    }
    expect(
      plan.days.flatMap((d) => d.steps).some((s) => s.kind === 'extra'),
    ).toBe(false);
    expect(planDepthFor(21).mode).toBe('short');
    expect(planDepthFor(22).mode).toBe('full');
  });

  it('day exam parts: carry first, a few older, today up to the target', () => {
    expect(dayExamParts(0, 40, 100, 30)).toEqual({
      carry: 0,
      today: 12,
      older: 3,
    });
    expect(dayExamParts(20, 40, 100, 30)).toEqual({
      carry: 20,
      today: 5,
      older: 3,
    });
    expect(dayExamParts(0, 40, 0, 30)).toEqual({
      carry: 0,
      today: 15,
      older: 0,
    });
    const big = dayExamParts(60, 40, 100, 30);
    expect(big.carry + big.today + big.older).toBe(40);
  });

  it('finds the shortest plan whose average day fits the target', () => {
    const days = daysForTargetMinutes(B_LIKE, 30, 45);
    expect(days).not.toBeNull();
    const avg = (d: number) => build(d).minutesPerDayAvg;
    expect(avg(days!)).toBeLessThanOrEqual(45);
    expect(avg(days! - 1)).toBeGreaterThan(45);
    expect(daysForTargetMinutes(B_LIKE, 30, 1)).toBeNull();
  });
});

describe('spreadOptional', () => {
  const lesson = (restIds: number[]) => ({
    id: 'x',
    subjectId: 3,
    part: 1,
    parts: 1,
    questionIds: [],
    cardIds: [],
    restIds,
  });

  it('spreads evenly, never before the card is taught', () => {
    const days = spreadOptional([
      [lesson([])],
      [lesson([1, 2, 3, 4, 5, 6, 7, 8, 9])],
      [lesson([])],
    ]);
    expect(days).toEqual([[], [1, 2, 3, 4, 5], [6, 7, 8, 9]]);
    const even = spreadOptional([
      [lesson([1, 2, 3, 4, 5, 6])],
      [lesson([])],
      [lesson([])],
    ]);
    expect(even.map((d) => d.length)).toEqual([2, 2, 2]);
    // review days after the learn days share the last day's tickets
    const withReview = spreadOptional(
      [[lesson([])], [lesson([1, 2, 3, 4])]],
      1,
    );
    expect(withReview).toEqual([[], [1, 2], [3, 4]]);
  });
});
