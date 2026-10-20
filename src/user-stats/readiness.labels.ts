import type { ReadinessConfidence } from './readiness.types.js';

/** Answers below this (about two tickets) give low confidence. */
const MEDIUM_CONFIDENCE_ANSWERS = 60;
/** Answers from this (about five tickets) give high confidence. */
const HIGH_CONFIDENCE_ANSWERS = 150;

/**
 * Confidence tracks how many exam answers the score is based on, so a run of
 * one-answer attempts does not read as "high".
 */
export function resolveReadinessConfidence(
  answeredCount: number,
): ReadinessConfidence {
  if (answeredCount <= 0) return 'none';
  if (answeredCount < MEDIUM_CONFIDENCE_ANSWERS) return 'low';
  if (answeredCount < HIGH_CONFIDENCE_ANSWERS) return 'medium';
  return 'high';
}

export function resolveReadinessLabel(
  readinessScore: number,
  confidence: ReadinessConfidence,
  readyForExam: boolean,
  readyScoreThreshold: number,
): string {
  if (confidence === 'none') {
    return 'გამოცდა ჯერ არ გაქვს გავლილი';
  }
  if (readyForExam) {
    return 'მზად ხარ გამოცდისთვის';
  }
  if (readinessScore < 50) return 'საჭიროებს მეტ სწავლას';
  if (readinessScore < readyScoreThreshold) return 'კარგი პროგრესი';
  return 'თითქმის მზად ხარ';
}
