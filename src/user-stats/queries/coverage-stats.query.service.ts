import { Injectable } from '@nestjs/common';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Question } from '../../questions/entities/question.entity';
import {
  Category,
  CategorySubjectRow,
} from '../../categories/entities/category.entity';
import { QUESTION_MASTERY_CORRECT_RATIO } from '../../common/constants/exam.constants.js';
import { bindCategoryFilter } from '../../common/utils/attempt-category-filter.util.js';
import {
  combinedGradedAnswersCte,
  masteryClassifiedCte,
  perQuestionRateCte,
} from '../../common/sql/combined-answers.sql.js';
import { SqlParams } from '../../common/sql/sql-params.js';
import { parsePgInt } from '../../common/utils/pg-row.util.js';
import { round3 } from '../../common/utils/round3.util.js';
import type {
  QuestionPoolExposure,
  SubjectAggregateRow,
} from '../user-stats.types.js';

export function toPoolExposure(
  distinctQuestionsAnswered: number,
  totalQuestionsInCategory: number,
): QuestionPoolExposure {
  return {
    distinctQuestionsAnswered,
    totalQuestionsInCategory,
    exposureRate:
      totalQuestionsInCategory > 0
        ? round3(distinctQuestionsAnswered / totalQuestionsInCategory)
        : 0,
  };
}

/** Topic catalog and how much of the question pool the user has covered. */
@Injectable()
export class CoverageStatsQueryService {
  constructor(
    @InjectEntityManager()
    private readonly manager: EntityManager,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  /** Per-topic mastered / not-mastered counts across exam + practice answers. */
  async loadSubjectAggregatesForCategory(
    userId: number,
    categoryId: number,
  ): Promise<SubjectAggregateRow[]> {
    const sp = new SqlParams();
    const userPh = sp.add(userId);
    const { filterPh, categoryPh: catPh } = bindCategoryFilter(sp, categoryId);
    const masteryPh = sp.add(QUESTION_MASTERY_CORRECT_RATIO);

    const rows = await this.manager.query<
      {
        subjectId: string;
        correctCount: string;
        wrongCount: string;
        distinctQuestions: string;
      }[]
    >(
      `
      WITH ${combinedGradedAnswersCte('combined', {
        userIdPlaceholder: userPh,
        categoryFilterPlaceholder: filterPh,
        categoryIdPlaceholder: catPh,
        includeSubject: true,
      })},
      ${perQuestionRateCte('combined', 'per_q', true)},
      ${masteryClassifiedCte('per_q', 'classified', masteryPh)}
      SELECT
        classified.subject AS "subjectId",
        SUM(CASE WHEN classified."isCorrect" = true THEN 1 ELSE 0 END)::int AS "correctCount",
        SUM(CASE WHEN classified."isCorrect" = false THEN 1 ELSE 0 END)::int AS "wrongCount",
        COUNT(*)::int AS "distinctQuestions"
      FROM classified
      GROUP BY classified.subject
      `,
      sp.all(),
    );

    return rows.map((row) => ({
      subjectId: parsePgInt(row.subjectId),
      correctCount: parsePgInt(row.correctCount),
      wrongCount: parsePgInt(row.wrongCount),
      distinctQuestions: parsePgInt(row.distinctQuestions),
    }));
  }

  /**
   * Subject aggregates and the distinct-questions-seen count from a single
   * scan of the answer history. The summary needs both; running
   * `loadSubjectAggregatesForCategory` and `loadQuestionPoolExposure` side by
   * side would read the same rows twice.
   */
  async loadSubjectAggregatesWithExposure(
    userId: number,
    categoryId: number,
  ): Promise<{
    subjects: SubjectAggregateRow[];
    distinctQuestionsAnswered: number;
  }> {
    const sp = new SqlParams();
    const userPh = sp.add(userId);
    const { filterPh, categoryPh: catPh } = bindCategoryFilter(sp, categoryId);
    const masteryPh = sp.add(QUESTION_MASTERY_CORRECT_RATIO);

    const rows = await this.manager.query<
      {
        distinctSeen: string;
        subjectId: string | null;
        correctCount: string | null;
        wrongCount: string | null;
        distinctQuestions: string | null;
      }[]
    >(
      `
      WITH ${combinedGradedAnswersCte('seen', {
        userIdPlaceholder: userPh,
        categoryFilterPlaceholder: filterPh,
        categoryIdPlaceholder: catPh,
        includeSubject: true,
        requireSubject: false,
        gradedPracticeOnly: false,
      })},
      graded AS (
        SELECT * FROM seen
        WHERE seen.correct IS NOT NULL AND seen.subject IS NOT NULL
      ),
      ${perQuestionRateCte('graded', 'per_q', true)},
      ${masteryClassifiedCte('per_q', 'classified', masteryPh)},
      by_subject AS (
        SELECT
          classified.subject AS "subjectId",
          SUM(CASE WHEN classified."isCorrect" = true THEN 1 ELSE 0 END)::int AS "correctCount",
          SUM(CASE WHEN classified."isCorrect" = false THEN 1 ELSE 0 END)::int AS "wrongCount",
          COUNT(*)::int AS "distinctQuestions"
        FROM classified
        GROUP BY classified.subject
      ),
      exposure AS (
        SELECT COUNT(DISTINCT seen."questionId")::int AS "distinctSeen" FROM seen
      )
      SELECT e."distinctSeen", s.*
      FROM exposure e
      LEFT JOIN by_subject s ON TRUE
      `,
      sp.all(),
    );

    return {
      distinctQuestionsAnswered: parsePgInt(rows[0]?.distinctSeen),
      subjects: rows
        .filter((row) => row.subjectId != null)
        .map((row) => ({
          subjectId: parsePgInt(row.subjectId),
          correctCount: parsePgInt(row.correctCount),
          wrongCount: parsePgInt(row.wrongCount),
          distinctQuestions: parsePgInt(row.distinctQuestions),
        })),
    };
  }

  /** Live question count for a category in one language. */
  async countQuestionsInCategory(
    categoryId: number,
    lang: string,
  ): Promise<number> {
    const row = await this.questionRepo
      .createQueryBuilder('q')
      .select('COUNT(*)', 'count')
      .where('q.lang = :lang', { lang })
      .andWhere(':categoryId = ANY(q.categories)', { categoryId })
      .getRawOne<{ count: string }>();
    return parsePgInt(row?.count);
  }

  /** Distinct questions seen (graded or not) vs the category pool size. */
  async loadQuestionPoolExposure(
    userId: number,
    categoryId: number,
    lang: string,
  ): Promise<QuestionPoolExposure> {
    const sp = new SqlParams();
    const userPh = sp.add(userId);
    const { filterPh, categoryPh: catPh } = bindCategoryFilter(sp, categoryId);

    const [answeredRow, totalQuestionsInCategory] = await Promise.all([
      this.manager.query<{ count: string }[]>(
        `
        WITH ${combinedGradedAnswersCte('combined', {
          userIdPlaceholder: userPh,
          categoryFilterPlaceholder: filterPh,
          categoryIdPlaceholder: catPh,
          gradedPracticeOnly: false,
        })}
        SELECT COUNT(DISTINCT "questionId")::int AS count
        FROM combined
        `,
        sp.all(),
      ),
      this.countQuestionsInCategory(categoryId, lang),
    ]);

    return toPoolExposure(
      parsePgInt(answeredRow[0]?.count),
      totalQuestionsInCategory,
    );
  }

  /** Category subject catalog, with counts recomputed from the live question pool. */
  async loadCategorySubjectCatalog(
    categoryId: number,
    lang: string,
  ): Promise<CategorySubjectRow[]> {
    const [category, liveRows] = await Promise.all([
      this.categoryRepo.findOne({
        where: { id: categoryId },
        select: ['id', 'subjects'],
      }),
      this.questionRepo
        .createQueryBuilder('q')
        .select('q.subject', 'subject')
        .addSelect('COUNT(*)', 'count')
        .where('q.lang = :lang', { lang })
        .andWhere(':categoryId = ANY(q.categories)', { categoryId })
        .andWhere('q.subject IS NOT NULL')
        .groupBy('q.subject')
        .orderBy('q.subject', 'ASC')
        .getRawMany<{ subject: string; count: string }>(),
    ]);

    const liveCounts = new Map(
      liveRows.map((r) => [parsePgInt(r.subject), parsePgInt(r.count)]),
    );

    if (category?.subjects?.length) {
      return [...category.subjects]
        .map((s) => ({
          ...s,
          questionsCount: liveCounts.get(s.id) ?? 0,
        }))
        .filter((s) => s.questionsCount > 0)
        .sort((a, b) => a.id - b.id);
    }

    return liveRows.map((r) => ({
      id: parsePgInt(r.subject),
      name: `Subject ${r.subject}`,
      questionsCount: parsePgInt(r.count),
    }));
  }
}
