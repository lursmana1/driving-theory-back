import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Question } from '../../questions/entities/question.entity';
import {
  applyQuestionFilters,
  QuestionFilterOpts,
} from '../../questions/question-query.util';
import { parsePgInt } from '../../common/utils/pg-row.util.js';
import type { SelectionRatios, WeaknessIds } from './selection.types.js';

@Injectable()
export class QuestionSamplingService {
  constructor(
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
  ) {}

  buildMatchFilter(
    lang: string,
    subjects?: number[],
    categories?: number[],
    allSubjects?: boolean,
  ): QuestionFilterOpts {
    return {
      lang,
      subjects,
      categories,
      allSubjects,
    };
  }

  async countMatching(filter: QuestionFilterOpts): Promise<number> {
    const qb = this.questionRepo.createQueryBuilder('q');
    applyQuestionFilters(qb, 'q', filter);
    return qb.getCount();
  }

  async sampleRandom(
    filter: QuestionFilterOpts,
    limit: number,
    exclude: number[] = [],
  ): Promise<number[]> {
    if (limit <= 0) return [];

    return this.sampleWhere(filter, limit, (qb) => {
      if (exclude.length) {
        qb.andWhere('q.id NOT IN (:...exclude)', { exclude });
      }
    });
  }

  async sampleWeighted(
    filter: QuestionFilterOpts,
    count: number,
    weakness: WeaknessIds,
    ratios: SelectionRatios,
  ): Promise<number[]> {
    const randomCount = Math.round(count * ratios.random);
    const mistakesCount = Math.round(count * ratios.mistakes);
    const successCount = count - randomCount - mistakesCount;

    const selectedIds = await this.sampleMistakesAndSuccess(
      filter,
      weakness,
      mistakesCount,
      successCount,
    );
    const randomIds = await this.sampleRandom(filter, randomCount, selectedIds);

    return [...selectedIds, ...randomIds];
  }

  private async sampleMistakesAndSuccess(
    filter: QuestionFilterOpts,
    weakness: WeaknessIds,
    mistakesCount: number,
    successCount: number,
  ): Promise<number[]> {
    const { mistakeIds, successIds, mistakeSubjects, successSubjects } =
      weakness;

    const [mistakeRows, successRows] = await Promise.all([
      this.sampleMistakeIds(filter, mistakeIds, mistakeSubjects, mistakesCount),
      this.sampleSuccessIds(
        filter,
        mistakeIds,
        successIds,
        successSubjects,
        successCount,
      ),
    ]);

    return [...mistakeRows, ...successRows];
  }

  private async sampleMistakeIds(
    filter: QuestionFilterOpts,
    mistakeIds: number[],
    mistakeSubjects: number[],
    limit: number,
  ): Promise<number[]> {
    if (limit <= 0) return [];
    if (mistakeIds.length === 0 && mistakeSubjects.length === 0) return [];

    return this.sampleWhere(filter, limit, (qb) => {
      this.whereIdOrSubject(
        qb,
        mistakeIds,
        'mistakeIds',
        mistakeSubjects,
        'mistakeSubjects',
      );
    });
  }

  private async sampleSuccessIds(
    filter: QuestionFilterOpts,
    mistakeIds: number[],
    successIds: number[],
    successSubjects: number[],
    limit: number,
  ): Promise<number[]> {
    if (limit <= 0) return [];
    if (successIds.length === 0 && successSubjects.length === 0) return [];

    return this.sampleWhere(filter, limit, (qb) => {
      if (mistakeIds.length) {
        qb.andWhere('q.id NOT IN (:...mistakeIds)', { mistakeIds });
      }
      this.whereIdOrSubject(
        qb,
        successIds,
        'successIds',
        successSubjects,
        'successSubjects',
      );
    });
  }

  private async sampleWhere(
    filter: QuestionFilterOpts,
    limit: number,
    refine: (qb: SelectQueryBuilder<Question>) => void,
  ): Promise<number[]> {
    const qb = this.questionRepo.createQueryBuilder('q').select('q.id', 'id');
    applyQuestionFilters(qb, 'q', filter);
    refine(qb);

    const rows = await qb.orderBy('RANDOM()').limit(limit).getRawMany<{
      id: string;
    }>();
    return rows.map((row) => parsePgInt(row.id));
  }

  /** Match questions in an id list, a subject list, or either. */
  private whereIdOrSubject(
    qb: SelectQueryBuilder<Question>,
    ids: number[],
    idParam: string,
    subjects: number[],
    subjectParam: string,
  ): void {
    const orParts: string[] = [];
    const params: Record<string, unknown> = {};
    if (ids.length) {
      orParts.push(`q.id IN (:...${idParam})`);
      params[idParam] = ids;
    }
    if (subjects.length) {
      orParts.push(`q.subject IN (:...${subjectParam})`);
      params[subjectParam] = subjects;
    }
    if (orParts.length === 0) return;
    qb.andWhere(`(${orParts.join(' OR ')})`, params);
  }
}
