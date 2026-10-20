import { computeReadiness } from './readiness.util';
import { estimateAnswerAccuracy, passProbability } from './readiness.scoring';

describe('passProbability', () => {
  it('matches the binomial tail for a 30-question ticket', () => {
    // 90% accuracy: B allows 5 wrong, A allows 3
    expect(passProbability(0.9, 30, 5)).toBeCloseTo(0.927, 3);
    expect(passProbability(0.9, 30, 3)).toBeCloseTo(0.647, 3);
  });

  it('is 1 at perfect accuracy and 0 at none', () => {
    expect(passProbability(1, 30, 5)).toBe(1);
    expect(passProbability(0, 30, 5)).toBe(0);
  });
});

describe('estimateAnswerAccuracy', () => {
  it('weights newer exams more', () => {
    const good = {
      correctCount: 29,
      minCorrectToPass: 25,
      passed: true,
      answeredCount: 30,
    };
    const bad = {
      correctCount: 9,
      minCorrectToPass: 25,
      passed: false,
      answeredCount: 15,
    };
    expect(estimateAnswerAccuracy([good, bad])).toBeGreaterThan(
      estimateAnswerAccuracy([bad, good]),
    );
  });

  it('counts only answers given when an exam was cut short', () => {
    const cut = {
      correctCount: 9,
      minCorrectToPass: 25,
      passed: false,
      answeredCount: 15,
    };
    // 9/15 = 60%, shrunk towards the 75% prior — not 9/30
    const accuracy = estimateAnswerAccuracy([cut]);
    expect(accuracy).toBeGreaterThan(0.6);
    expect(accuracy).toBeLessThan(0.75);
  });
});

describe('computeReadiness', () => {
  const B = { questionCount: 30, minCorrectToPass: 25, passRate: 25 / 30 };
  const A = { questionCount: 30, minCorrectToPass: 27, passRate: 27 / 30 };

  const uncovered = (id: number) => ({
    subjectId: id,
    correctCount: 4,
    wrongCount: 2,
    distinctQuestionsAnswered: 5,
    totalQuestions: 40,
  });

  const covered = (id: number) => ({
    subjectId: id,
    correctCount: 20,
    wrongCount: 5,
    distinctQuestionsAnswered: 28,
    totalQuestions: 40,
  });

  /** 21 of 32 topics covered (66%) — just over the 65% coverage gate. */
  const gateCovered = [
    ...Array.from({ length: 21 }, (_, i) => covered(i + 1)),
    ...Array.from({ length: 11 }, (_, i) => uncovered(i + 22)),
  ];

  const pass = (correctCount: number) => ({
    correctCount,
    minCorrectToPass: 25,
    passed: true,
    answeredCount: 30,
  });

  const repeat = <T>(n: number, item: T): T[] =>
    Array.from({ length: n }, () => item);

  it('returns none confidence with no full exams', () => {
    const result = computeReadiness({
      ...B,
      attempts: [],
      subjects: gateCovered,
      subjectsTotal: 32,
    });
    expect(result.confidence).toBe('none');
    expect(result.readinessScore).toBe(0);
    expect(result.readyForExam).toBe(false);
  });

  it('keeps score low when recent exams are early fails', () => {
    const result = computeReadiness({
      ...B,
      attempts: [
        {
          correctCount: 2,
          minCorrectToPass: 25,
          passed: false,
          answeredCount: 8,
          earlyWrongCount: 6,
        },
        {
          correctCount: 4,
          minCorrectToPass: 25,
          passed: false,
          answeredCount: 10,
          earlyWrongCount: 6,
        },
      ],
      subjects: [],
      subjectsTotal: 32,
    });
    expect(result.readinessScore).toBeLessThan(20);
    expect(result.earlyFailCount).toBe(2);
    expect(result.examAccuracy).toBe(0);
  });

  it('marks a consistent passer ready', () => {
    // Old formula capped this user at 89 → never ready.
    const result = computeReadiness({
      ...B,
      attempts: repeat(20, pass(28)),
      subjects: gateCovered,
      subjectsTotal: 32,
      completedAttemptsTotal: 24,
    });
    expect(result.readinessScore).toBeGreaterThanOrEqual(95);
    expect(result.confidence).toBe('high');
    expect(result.completedAttemptsUsed).toBe(20);
    expect(result.completedAttemptsTotal).toBe(24);
    expect(result.readyForExam).toBe(true);
  });

  it('scores the same accuracy lower on a stricter pass mark', () => {
    const attempts = repeat(10, pass(27));
    const onB = computeReadiness({
      ...B,
      attempts,
      subjects: [],
      subjectsTotal: 32,
    });
    const onA = computeReadiness({
      ...A,
      attempts: attempts.map((a) => ({ ...a, minCorrectToPass: 27 })),
      subjects: [],
      subjectsTotal: 32,
    });
    expect(onB.answerAccuracy).toBe(onA.answerAccuracy);
    expect(onB.readinessScore - onA.readinessScore).toBeGreaterThan(25);
  });

  it('needs the last three full exams passed', () => {
    const result = computeReadiness({
      ...B,
      attempts: [
        {
          correctCount: 9,
          minCorrectToPass: 25,
          passed: false,
          answeredCount: 15,
        },
        ...repeat(10, pass(30)),
      ],
      subjects: gateCovered,
      subjectsTotal: 32,
    });
    expect(result.lastAttemptPassed).toBe(false);
    expect(result.readyForExam).toBe(false);
  });

  it('does not mark one perfect exam ready', () => {
    const result = computeReadiness({
      ...B,
      attempts: [pass(30)],
      subjects: gateCovered,
      subjectsTotal: 32,
    });
    expect(result.confidence).toBe('low');
    expect(result.readyForExam).toBe(false);
  });

  it('keeps topic coverage as a gate, not part of the score', () => {
    const attempts = repeat(10, pass(29));
    const under = computeReadiness({
      ...B,
      attempts,
      // 20 of 32 = 62.5%, just under the 65% gate
      subjects: [...repeat(20, covered(1)), ...repeat(12, uncovered(2))],
      subjectsTotal: 32,
    });
    const over = computeReadiness({
      ...B,
      attempts,
      subjects: gateCovered,
      subjectsTotal: 32,
    });
    expect(under.readinessScore).toBe(over.readinessScore);
    expect(under.readyForExam).toBe(false);
    expect(over.readyForExam).toBe(true);
  });

  it('bases confidence on answers, not on the number of attempts', () => {
    const oneAnswerQuits = repeat(20, {
      correctCount: 0,
      minCorrectToPass: 25,
      passed: false,
      answeredCount: 1,
    });
    const result = computeReadiness({
      ...B,
      attempts: oneAnswerQuits,
      subjects: [],
      subjectsTotal: 32,
    });
    expect(result.completedAttemptsUsed).toBe(20);
    expect(result.confidence).toBe('low');
  });

  it('falls back to lifetime subject accuracy before any full exam', () => {
    const result = computeReadiness({
      ...B,
      attempts: [],
      subjects: [{ ...uncovered(1), correctCount: 3, wrongCount: 1 }],
      subjectsTotal: 32,
    });
    expect(result.answerAccuracy).toBe(0.75);
    expect(result.readinessScore).toBe(0);
  });
});
