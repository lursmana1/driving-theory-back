import { Injectable, NotFoundException } from '@nestjs/common';
import { CategorySubjectRow } from '../categories/entities/category.entity';
import { DEFAULT_LANG } from '../common/constants/lang.constants.js';
import {
  MIN_SUBJECT_ATTEMPTS_FOR_STATS,
  SUBJECT_COVERAGE_RATIO,
  READINESS_MAX_ATTEMPTS,
  READINESS_READY_PRACTICE_THRESHOLD,
  READINESS_READY_SCORE_THRESHOLD,
} from '../common/constants/exam.constants.js';
import { getCategoryDisplayMeta } from '../common/constants/category.constants.js';
import {
  formatExamRuleResponse,
  resolveGeorgianExamRule,
} from '../common/utils/georgian-exam-rules.util.js';
import { round3 } from '../common/utils/round3.util.js';
import { computeReadiness } from './readiness.util.js';
import {
  toReadinessResponse,
  toWeakSubjectItems,
} from './user-stats.mapper.js';
import { buildSubjectProgressRows } from './user-stats-query.util.js';
import { WeakStatsQueryService } from './queries/weak-stats.query.service';
import { AttemptStatsQueryService } from './queries/attempt-stats.query.service';
import {
  CoverageStatsQueryService,
  toPoolExposure,
} from './queries/coverage-stats.query.service';
import type {
  CategoryProgress,
  QuestionPoolResponse,
  ReadinessResponse,
  RecentAttemptRow,
  SubjectAggregateRow,
  SubjectProgressResponse,
  UserStatsSummary,
  WeakQuestionsResponse,
  WeakSubjectsResponse,
} from './user-stats.types.js';

/**
 * Builds the /user-stats API responses. All SQL lives in the `queries/`
 * services; this one composes rows into the payloads the profile screens read.
 */
@Injectable()
export class UserStatsService {
  constructor(
    private readonly weak: WeakStatsQueryService,
    private readonly attempts: AttemptStatsQueryService,
    private readonly coverage: CoverageStatsQueryService,
  ) {}

  async getSummary(
    userId: number,
    categoryId: number,
    lang: string = DEFAULT_LANG,
  ): Promise<UserStatsSummary> {
    // One history scan feeds both the subject cards and pool exposure; the
    // remaining reads are independent of it and of each other.
    const [catalog, history, totalQuestions, recentAttempts] =
      await Promise.all([
        this.coverage.loadCategorySubjectCatalog(categoryId, lang),
        this.coverage.loadSubjectAggregatesWithExposure(userId, categoryId),
        this.coverage.countQuestionsInCategory(categoryId, lang),
        this.attempts.loadRecentCompletedAttempts(userId, categoryId),
      ]);

    const progress = this.toCategoryProgress(
      categoryId,
      catalog,
      history.subjects,
    );
    const readiness = this.toReadiness(categoryId, progress, recentAttempts);
    const pool = toPoolExposure(
      history.distinctQuestionsAnswered,
      totalQuestions,
    );

    return {
      categoryId,
      categoryName: readiness.categoryName,
      readinessScore: readiness.readinessScore,
      readyForExam: readiness.readyForExam,
      confidence: readiness.confidence,
      label: readiness.label,
      subjectsCovered: readiness.subjectsCovered,
      subjectsMastered: readiness.subjectsMastered,
      subjectsTotal: readiness.subjectsTotal,
      weakSubjectsCount: readiness.weakSubjectsCount,
      completedAttemptsTotal: readiness.completedAttemptsTotal,
      distinctQuestionsAnswered: pool.distinctQuestionsAnswered,
      totalQuestionsInCategory: pool.totalQuestionsInCategory,
      exposureRate: pool.exposureRate,
      questionCount: readiness.questionCount,
      minCorrectToPass: readiness.minCorrectToPass,
    };
  }

  async getQuestionPool(
    userId: number,
    categoryId: number,
    lang: string = DEFAULT_LANG,
  ): Promise<QuestionPoolResponse> {
    const pool = await this.coverage.loadQuestionPoolExposure(
      userId,
      categoryId,
      lang,
    );
    return { categoryId, ...pool };
  }

  async getReadiness(
    userId: number,
    categoryId: number,
    lang: string = DEFAULT_LANG,
  ): Promise<ReadinessResponse> {
    const progress = await this.loadCategoryProgress(userId, categoryId, lang);
    return this.buildReadiness(userId, categoryId, progress);
  }

  async getSubjectProgress(
    userId: number,
    categoryId: number,
    lang: string = DEFAULT_LANG,
  ): Promise<SubjectProgressResponse> {
    const progress = await this.loadCategoryProgress(userId, categoryId, lang);
    return this.toSubjectProgressResponse(categoryId, progress);
  }

  async getWeakQuestions(
    userId: number,
    lang: string = DEFAULT_LANG,
    categoryId?: number,
  ): Promise<WeakQuestionsResponse> {
    const { rows, total } = await this.weak.loadWeakQuestionCounts(
      userId,
      categoryId,
    );
    const previews = await this.weak.loadQuestionPreviews(
      rows.map((r) => r.questionId),
      lang,
    );

    return {
      categoryId: categoryId ?? null,
      data: rows.map((row) => ({
        questionId: row.questionId,
        wrongCount: row.wrongCount,
        totalAttempts: row.totalAttempts,
        preview: previews.get(row.questionId) ?? null,
      })),
      total,
    };
  }

  async getWeakSubjects(
    userId: number,
    lang: string = DEFAULT_LANG,
    categoryId?: number,
  ): Promise<WeakSubjectsResponse> {
    const [top, catalog] = await Promise.all([
      this.weak.loadWeakSubjectTop(userId, categoryId ?? null),
      categoryId != null
        ? this.coverage.loadCategorySubjectCatalog(categoryId, lang)
        : Promise.resolve([] as CategorySubjectRow[]),
    ]);

    if (top.rows.length === 0) {
      return { categoryId: categoryId ?? null, data: [], total: top.total };
    }

    const fallbackTotals =
      catalog.length === 0
        ? await this.weak.loadQuestionTotalsBySubject(
            top.rows.map((row) => row.subjectId),
            lang,
            categoryId,
          )
        : new Map<number, number>();

    return {
      categoryId: categoryId ?? null,
      data: toWeakSubjectItems(top.rows, catalog, fallbackTotals),
      total: top.total,
    };
  }

  private toSubjectProgressResponse(
    categoryId: number,
    progress: CategoryProgress,
  ): SubjectProgressResponse {
    const { display, passRate, progressRows } = progress;
    return {
      categoryId,
      categoryName: display.name,
      passRate: round3(passRate),
      coverageRatioRequired: SUBJECT_COVERAGE_RATIO,
      minAttemptsForMastery: MIN_SUBJECT_ATTEMPTS_FOR_STATS,
      subjectsTotal: progressRows.length,
      subjectsCovered: progressRows.filter((s) => s.covered).length,
      subjectsMastered: progressRows.filter((s) => s.mastered).length,
      data: progressRows,
    };
  }

  private async buildReadiness(
    userId: number,
    categoryId: number,
    progress: CategoryProgress,
  ): Promise<ReadinessResponse> {
    return this.toReadiness(
      categoryId,
      progress,
      await this.attempts.loadRecentCompletedAttempts(userId, categoryId),
    );
  }

  private toReadiness(
    categoryId: number,
    progress: CategoryProgress,
    recentAttempts: { rows: RecentAttemptRow[]; completedTotal: number },
  ): ReadinessResponse {
    const { display, rule, passRate, progressRows } = progress;
    const { rows: attemptRows, completedTotal: completedAttemptsTotal } =
      recentAttempts;

    const readiness = computeReadiness({
      attempts: attemptRows.map((row) => ({
        correctCount: row.correctCount,
        minCorrectToPass: row.minCorrectToPass,
        passed: row.passed,
        answeredCount: row.answeredCount,
        earlyWrongCount: row.earlyWrongCount,
      })),
      subjects: progressRows.map((row) => ({
        subjectId: row.subjectId,
        correctCount: row.correctCount,
        wrongCount: row.wrongCount,
        distinctQuestionsAnswered: row.distinctQuestionsAnswered,
        totalQuestions: row.totalQuestions,
      })),
      subjectsTotal: progressRows.length,
      questionCount: rule.questionCount,
      passRate,
      minSubjectAttempts: MIN_SUBJECT_ATTEMPTS_FOR_STATS,
      completedAttemptsTotal,
      recentExamLimit: READINESS_MAX_ATTEMPTS,
      readyScoreThreshold: READINESS_READY_SCORE_THRESHOLD,
      readyPracticeThreshold: READINESS_READY_PRACTICE_THRESHOLD,
    });

    return toReadinessResponse(
      display.name,
      formatExamRuleResponse(categoryId, rule),
      readiness,
    );
  }

  private async loadCategoryProgress(
    userId: number,
    categoryId: number,
    lang: string,
  ): Promise<CategoryProgress> {
    const [catalog, subjectStats] = await Promise.all([
      this.coverage.loadCategorySubjectCatalog(categoryId, lang),
      this.coverage.loadSubjectAggregatesForCategory(userId, categoryId),
    ]);
    return this.toCategoryProgress(categoryId, catalog, subjectStats);
  }

  private toCategoryProgress(
    categoryId: number,
    catalog: CategorySubjectRow[],
    subjectStats: SubjectAggregateRow[],
  ): CategoryProgress {
    const display = getCategoryDisplayMeta(categoryId);
    if (!display) {
      throw new NotFoundException(`Category ${categoryId} not found`);
    }

    const rule = resolveGeorgianExamRule({ categories: [categoryId] });
    const passRate = rule.minCorrectToPass / rule.questionCount;

    const { countsBySubject, distinctBySubject } =
      this.indexSubjectAggregates(subjectStats);

    const progressRows = buildSubjectProgressRows(
      catalog,
      countsBySubject,
      distinctBySubject,
      passRate,
      MIN_SUBJECT_ATTEMPTS_FOR_STATS,
      SUBJECT_COVERAGE_RATIO,
    );

    return { display, rule, passRate, progressRows };
  }

  private indexSubjectAggregates(rows: SubjectAggregateRow[]): {
    countsBySubject: Map<number, { correctCount: number; wrongCount: number }>;
    distinctBySubject: Map<number, number>;
  } {
    const countsBySubject = new Map<
      number,
      { correctCount: number; wrongCount: number }
    >();
    const distinctBySubject = new Map<number, number>();
    for (const row of rows) {
      countsBySubject.set(row.subjectId, {
        correctCount: row.correctCount,
        wrongCount: row.wrongCount,
      });
      distinctBySubject.set(row.subjectId, row.distinctQuestions);
    }
    return { countsBySubject, distinctBySubject };
  }
}
