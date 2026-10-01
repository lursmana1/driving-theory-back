import type { CategorySubjectRow } from '../categories/entities/category.entity';
import {
  SUBJECT_COVERAGE_RATIO,
  MIN_SUBJECT_ATTEMPTS_FOR_STATS,
} from '../common/constants/exam.constants.js';
import { round3 } from '../common/utils/round3.util.js';

type SubjectCountRow = {
  subjectId: number;
  correctCount: number;
  wrongCount: number;
};

export type SubjectProgressRow = SubjectCountRow & {
  name: string;
  attempted: number;
  correctnessRate: number;
  /** Covered when distinctQuestionsAnswered / totalQuestions ≥ SUBJECT_COVERAGE_RATIO. */
  covered: boolean;
  mastered: boolean;
  totalQuestions: number;
  /** Unique questions with a graded answer (last attempt wins for correct/wrong). */
  distinctQuestionsAnswered: number;
  coverageRate: number;
};

export function isSubjectCovered(
  distinctQuestionsAnswered: number,
  totalQuestions: number,
  coverageRatio: number = SUBJECT_COVERAGE_RATIO,
): boolean {
  if (totalQuestions <= 0) return false;
  return distinctQuestionsAnswered / totalQuestions >= coverageRatio;
}

function isSubjectMastered(
  attempted: number,
  correctnessRate: number,
  passRate: number,
  minMasteryAttempts: number = MIN_SUBJECT_ATTEMPTS_FOR_STATS,
): boolean {
  return attempted >= minMasteryAttempts && correctnessRate >= passRate;
}

export function buildSubjectProgressRows(
  catalog: CategorySubjectRow[],
  countsBySubject: Map<number, { correctCount: number; wrongCount: number }>,
  distinctBySubject: Map<number, number>,
  passRate: number,
  minMasteryAttempts: number = MIN_SUBJECT_ATTEMPTS_FOR_STATS,
  coverageRatio: number = SUBJECT_COVERAGE_RATIO,
): SubjectProgressRow[] {
  return catalog.map((subject) => {
    const counts = countsBySubject.get(subject.id) ?? {
      correctCount: 0,
      wrongCount: 0,
    };
    const attempted = counts.correctCount + counts.wrongCount;
    const correctnessRate = attempted > 0 ? counts.correctCount / attempted : 0;
    const distinctQuestionsAnswered = distinctBySubject.get(subject.id) ?? 0;
    const totalQuestions = subject.questionsCount;
    const coverageRate =
      totalQuestions > 0 ? distinctQuestionsAnswered / totalQuestions : 0;

    return {
      subjectId: subject.id,
      name: subject.name,
      attempted,
      correctCount: counts.correctCount,
      wrongCount: counts.wrongCount,
      correctnessRate: round3(correctnessRate),
      covered: isSubjectCovered(
        distinctQuestionsAnswered,
        totalQuestions,
        coverageRatio,
      ),
      mastered: isSubjectMastered(
        attempted,
        correctnessRate,
        passRate,
        minMasteryAttempts,
      ),
      totalQuestions,
      distinctQuestionsAnswered,
      coverageRate: round3(coverageRate),
    };
  });
}
