import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';
import { Question } from '../questions/entities/question.entity';
import { DEFAULT_LANG } from '../common/constants/lang.constants.js';
import {
  groupLiveCategoryCounts,
  withLiveSubjectCounts,
  type LiveCategoryCountRow,
  type LiveCategoryCounts,
} from '../common/utils/category-live-counts.util.js';
import { getCategoryDisplayMeta } from '../common/constants/category.constants.js';
import {
  formatExamRuleResponse,
  resolveGeorgianExamRule,
} from '../common/utils/georgian-exam-rules.util.js';

/**
 * Live questions per (category, subject). ka/ru/en carry the same ids and
 * categories, so one language is enough. Archived questions are not counted.
 */
export const LIVE_CATEGORY_COUNTS_SQL = `
SELECT c AS category, q.subject AS subject, COUNT(*)::int AS count
FROM questions q
CROSS JOIN LATERAL unnest(q.categories) AS c
WHERE q.lang = $1
GROUP BY c, q.subject
`;

const NO_LIVE_QUESTIONS: LiveCategoryCounts = {
  total: 0,
  bySubject: new Map(),
};

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
  ) {}

  create(_createCategoryDto: CreateCategoryDto) {
    return 'This action adds a new category';
  }

  private withExamRules(
    category: Pick<
      Category,
      'id' | 'name' | 'iconKey' | 'questionsCount' | 'subjectCount'
    >,
  ) {
    const display = getCategoryDisplayMeta(category.id);
    const rule = resolveGeorgianExamRule({ categories: [category.id] });
    return {
      ...category,
      name: display?.name ?? category.name,
      iconKey: display?.iconKey ?? category.iconKey,
      ...formatExamRuleResponse(category.id, rule),
    };
  }

  /**
   * `questionsCount` / `subjectCount` are computed from live questions; the
   * stored columns on `categories` are not kept up to date.
   */
  async findAll() {
    const [rows, live] = await Promise.all([
      this.categoryRepo.find({
        order: { id: 'ASC' },
        select: ['id', 'name', 'iconKey', 'subjects'],
      }),
      this.loadLiveCounts(),
    ]);
    return rows.map((row) => {
      const counts = live.get(row.id) ?? NO_LIVE_QUESTIONS;
      return this.withExamRules({
        id: row.id,
        name: row.name,
        iconKey: row.iconKey,
        questionsCount: counts.total,
        subjectCount: withLiveSubjectCounts(row.subjects, counts.bySubject)
          .length,
      });
    });
  }

  async findOne(id: number) {
    const [category, live] = await Promise.all([
      this.categoryRepo.findOne({ where: { id } }),
      this.loadLiveCounts(),
    ]);
    if (!category) {
      throw new NotFoundException(`Category ${id} not found`);
    }

    const counts = live.get(id) ?? NO_LIVE_QUESTIONS;
    const subjects = withLiveSubjectCounts(category.subjects, counts.bySubject);
    return {
      ...this.withExamRules({
        id: category.id,
        name: category.name,
        iconKey: category.iconKey,
        questionsCount: counts.total,
        subjectCount: subjects.length,
      }),
      subjects,
    };
  }

  private async loadLiveCounts() {
    const rows = await this.questionRepo.query<LiveCategoryCountRow[]>(
      LIVE_CATEGORY_COUNTS_SQL,
      [DEFAULT_LANG],
    );
    return groupLiveCategoryCounts(rows);
  }

  update(id: number, _updateCategoryDto: UpdateCategoryDto) {
    return `This action updates a #${id} category`;
  }

  remove(id: number) {
    return `This action removes a #${id} category`;
  }
}
