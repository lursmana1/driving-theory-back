import { SelectQueryBuilder } from 'typeorm';
import { Question } from './entities/question.entity';

export type QuestionFilterOpts = {
  lang: string;
  category?: number;
  subjects?: number[];
  categories?: number[];
  allSubjects?: boolean;
};

export function applyQuestionFilters(
  qb: SelectQueryBuilder<Question>,
  alias: string,
  opts: QuestionFilterOpts,
): void {
  qb.andWhere(`${alias}.lang = :lang`, { lang: opts.lang });

  if (opts.category !== undefined && Number.isFinite(opts.category)) {
    qb.andWhere(`:category = ANY(${alias}.categories)`, {
      category: opts.category,
    });
  }

  if (opts.categories?.length) {
    qb.andWhere(`${alias}.categories && ARRAY[:...filterCategories]::int[]`, {
      filterCategories: opts.categories,
    });
  }

  if (!opts.allSubjects && opts.subjects?.length) {
    qb.andWhere(`${alias}.subject IN (:...subjects)`, {
      subjects: opts.subjects,
    });
  }
}

export function stripLangField<T extends Question>(row: T): Omit<T, 'lang'> {
  const { lang: _lang, ...rest } = row;
  return rest;
}
