/**
 * Readiness score (მზაობის ქულა) — category-scoped, 0–100.
 *
 * Only full exams count: every subject of the category, official ticket size.
 * Topic drills and custom-size tickets feed subject stats, not readiness.
 *
 *   accuracy = recency-weighted correct / answered over the last 20 full
 *              exams, shrunk towards a prior so one exam cannot decide it
 *   score    = 100 × P(wrong answers ≤ category limit) on an official ticket
 *
 * readyForExam: score ≥85 + last 3 full exams passed + ≥65% topics covered.
 *
 * Scoring primitives live in `readiness.scoring.ts`, wording in
 * `readiness.labels.ts`, shapes in `readiness.types.ts`.
 */

import {
  READINESS_MAX_ATTEMPTS,
  READINESS_READY_SCORE_THRESHOLD,
  READINESS_READY_PRACTICE_THRESHOLD,
  READINESS_READY_PASS_STREAK,
  MIN_SUBJECT_ATTEMPTS_FOR_STATS,
} from '../common/constants/exam.constants.js';
import { round3 } from '../common/utils/round3.util.js';
import {
  computeAnswerAccuracy,
  computeCoverageFactor,
  countCoveredSubjects,
  countSubjectsByMastery,
  estimateAnswerAccuracy,
  isEarlyFail,
  passProbability,
} from './readiness.scoring.js';
import {
  resolveReadinessConfidence,
  resolveReadinessLabel,
} from './readiness.labels.js';
import type {
  ComputeReadinessInput,
  ReadinessResult,
} from './readiness.types.js';

export function computeReadiness(
  input: ComputeReadinessInput,
): ReadinessResult {
  const {
    attempts,
    subjects,
    subjectsTotal,
    questionCount,
    minCorrectToPass,
    passRate,
    minSubjectAttempts = MIN_SUBJECT_ATTEMPTS_FOR_STATS,
    completedAttemptsTotal,
    recentExamLimit = READINESS_MAX_ATTEMPTS,
    readyScoreThreshold = READINESS_READY_SCORE_THRESHOLD,
    readyPracticeThreshold = READINESS_READY_PRACTICE_THRESHOLD,
    readyPassStreak = READINESS_READY_PASS_STREAK,
  } = input;

  const recentAttempts = attempts.slice(0, recentExamLimit);
  const hasExams = recentAttempts.length > 0;
  // Lifetime subject history is shown until the user has sat a full exam.
  const answerAccuracy = hasExams
    ? estimateAnswerAccuracy(recentAttempts)
    : computeAnswerAccuracy(subjects);
  const readinessScore = hasExams
    ? Math.round(
        100 *
          passProbability(
            answerAccuracy,
            questionCount,
            questionCount - minCorrectToPass,
          ),
      )
    : 0;

  const subjectsCovered = countCoveredSubjects(subjects);
  const practicePart = subjectsTotal > 0 ? subjectsCovered / subjectsTotal : 0;
  const { mastered, weak } = countSubjectsByMastery(
    subjects,
    minSubjectAttempts,
    passRate,
  );

  const confidence = resolveReadinessConfidence(
    recentAttempts.reduce(
      (sum, attempt) => sum + (attempt.answeredCount ?? attempt.correctCount),
      0,
    ),
  );
  const lastAttemptPassed = hasExams ? recentAttempts[0].passed : null;
  const streak = recentAttempts.slice(0, readyPassStreak);
  const readyForExam =
    streak.length >= readyPassStreak &&
    streak.every((attempt) => attempt.passed) &&
    readinessScore >= readyScoreThreshold &&
    practicePart >= readyPracticeThreshold;

  return {
    readinessScore,
    confidence,
    readyForExam,
    label: resolveReadinessLabel(
      readinessScore,
      confidence,
      readyForExam,
      readyScoreThreshold,
    ),
    examAccuracy: hasExams
      ? round3(
          recentAttempts.filter((a) => a.passed).length / recentAttempts.length,
        )
      : 0,
    answerAccuracy: round3(answerAccuracy),
    practicePart: round3(practicePart),
    coverageFactor: round3(computeCoverageFactor(practicePart)),
    earlyFailCount: recentAttempts.filter((a) => isEarlyFail(a, questionCount))
      .length,
    lastAttemptPassed,
    completedAttemptsTotal: completedAttemptsTotal ?? attempts.length,
    completedAttemptsUsed: recentAttempts.length,
    subjectsCovered,
    subjectsMastered: mastered,
    subjectsTotal,
    weakSubjectsCount: weak,
  };
}
