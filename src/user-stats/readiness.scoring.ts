import {
  SUBJECT_COVERAGE_RATIO,
  EARLY_FAIL_WINDOW,
} from '../common/constants/exam.constants.js';
import { isSubjectCovered } from './user-stats-query.util.js';
import type {
  ReadinessAttemptInput,
  ReadinessSubjectInput,
} from './readiness.types.js';

/** Each older exam weighs this much of the next newer one. */
const RECENCY_DECAY = 0.85;

/**
 * Accuracy assumed before any evidence, worth this many answers. Keeps one
 * lucky exam from jumping straight to 100; fades as real answers pile up.
 */
const PRIOR_ACCURACY = 0.75;
const PRIOR_WEIGHT = 15;

/**
 * Diagnostic coverage factor for API/UI (not part of the score).
 * 0 covered → COVERAGE_FLOOR; all covered → 1.
 */
const COVERAGE_FLOOR = 0.55;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/**
 * A failed attempt counts as an early fail when the user gave up in the first
 * few answers, or burned their whole wrong-answer budget inside that window.
 */
export function isEarlyFail(
  attempt: ReadinessAttemptInput,
  questionCount: number,
  earlyWindow: number = EARLY_FAIL_WINDOW,
): boolean {
  if (attempt.passed) return false;

  const maxWrong = Math.max(1, questionCount - attempt.minCorrectToPass);
  const answered = attempt.answeredCount ?? attempt.correctCount;
  const earlyWrong = attempt.earlyWrongCount ?? 0;

  if (answered > 0 && answered <= earlyWindow) return true;
  return earlyWrong >= maxWrong;
}

/**
 * Per-question accuracy from recent exam answers (most recent first), newer
 * exams weighted more, shrunk towards PRIOR_ACCURACY. Exams the client cut
 * short after too many mistakes count only the answers actually given.
 */
export function estimateAnswerAccuracy(
  attempts: ReadinessAttemptInput[],
): number {
  let correct = PRIOR_ACCURACY * PRIOR_WEIGHT;
  let answered = PRIOR_WEIGHT;
  attempts.forEach((attempt, index) => {
    const weight = RECENCY_DECAY ** index;
    correct += weight * attempt.correctCount;
    answered += weight * (attempt.answeredCount ?? attempt.correctCount);
  });
  return clamp01(correct / answered);
}

/** P(at most `maxWrong` wrong out of `questionCount`) at per-question accuracy. */
export function passProbability(
  accuracy: number,
  questionCount: number,
  maxWrong: number,
): number {
  const wrongRate = clamp01(1 - accuracy);
  let sum = 0;
  let ways = 1; // C(questionCount, k)
  for (let k = 0; k <= Math.min(maxWrong, questionCount); k++) {
    sum += ways * wrongRate ** k * (1 - wrongRate) ** (questionCount - k);
    ways = (ways * (questionCount - k)) / (k + 1);
  }
  return clamp01(sum);
}

/** Lifetime per-subject accuracy — shown when there are no exams yet. */
export function computeAnswerAccuracy(
  subjects: ReadinessSubjectInput[],
): number {
  let correct = 0;
  let total = 0;
  for (const subject of subjects) {
    correct += subject.correctCount;
    total += subject.correctCount + subject.wrongCount;
  }
  return total > 0 ? correct / total : 0;
}

export function countCoveredSubjects(
  subjects: ReadinessSubjectInput[],
): number {
  return subjects.filter((subject) =>
    isSubjectCovered(
      subject.distinctQuestionsAnswered,
      subject.totalQuestions,
      SUBJECT_COVERAGE_RATIO,
    ),
  ).length;
}

/** Subjects with enough attempts to judge, split by the pass-rate threshold. */
export function countSubjectsByMastery(
  subjects: ReadinessSubjectInput[],
  minSubjectAttempts: number,
  passRate: number,
): { mastered: number; weak: number } {
  let mastered = 0;
  let weak = 0;

  for (const subject of subjects) {
    const attempted = subject.correctCount + subject.wrongCount;
    if (attempted < minSubjectAttempts) continue;
    if (subject.correctCount / attempted >= passRate) mastered += 1;
    else weak += 1;
  }

  return { mastered, weak };
}

/**
 * 0 covered → COVERAGE_FLOOR; all covered → 1.
 * Uses √ so early topic progress helps more than a linear gate.
 */
export function computeCoverageFactor(practicePart: number): number {
  return (
    COVERAGE_FLOOR + (1 - COVERAGE_FLOOR) * Math.sqrt(clamp01(practicePart))
  );
}
