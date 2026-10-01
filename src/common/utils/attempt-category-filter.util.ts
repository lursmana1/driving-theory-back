import { SqlParams } from '../sql/sql-params.js';

export function categoryFilterJson(categoryId: number): string {
  return JSON.stringify([categoryId]);
}

/**
 * `$n` pair used by the graded-answer CTEs: category jsonb filter, then category id.
 * Callers must add these in this order; the SQL placeholders depend on it.
 */
export function bindCategoryFilter(
  params: SqlParams,
  categoryId: number,
): { filterPh: string; categoryPh: string } {
  return {
    filterPh: params.add(categoryFilterJson(categoryId)),
    categoryPh: params.add(categoryId),
  };
}

/**
 * Match attempts tagged with a category, or legacy attempts with empty `categories`
 * where questions in the attempt belong to that category.
 */
export function attemptMatchesCategoryWhere(
  attemptAlias: string,
  _categoryId: number,
  categoryFilterParam = 'categoryFilter',
  categoryIdParam = 'categoryId',
): string {
  return taggedOrLegacyCategorySql(
    attemptAlias,
    `:${categoryFilterParam}`,
    attemptQuestionIdsMatchCategorySql(attemptAlias, `:${categoryIdParam}`),
  );
}

export function attemptMatchesCategorySql(
  attemptAlias: string,
  categoryFilterPlaceholder: string,
  categoryIdPlaceholder: string,
): string {
  return taggedOrLegacyCategorySql(
    attemptAlias,
    categoryFilterPlaceholder,
    attemptQuestionIdsMatchCategorySql(attemptAlias, categoryIdPlaceholder),
  );
}

/**
 * Cheaper category match when `user_answers` is already joined — uses the answer's
 * questionId instead of unnesting the full attempt `questionIds` array.
 */
export function answerJoinedCategorySql(
  attemptAlias: string,
  answerAlias: string,
  categoryFilterPlaceholder: string,
  categoryIdPlaceholder: string,
): string {
  return taggedOrLegacyCategorySql(
    attemptAlias,
    categoryFilterPlaceholder,
    `EXISTS (
        SELECT 1
        FROM questions q
        WHERE q.id = ${answerAlias}."questionId"
          AND q.lang = ${attemptAlias}.lang
          AND ${categoryIdPlaceholder} = ANY(q.categories)
      )`,
  );
}

export function attemptCategoryMatchParams(categoryId: number): {
  categoryFilter: string;
  categoryId: number;
} {
  return {
    categoryFilter: categoryFilterJson(categoryId),
    categoryId,
  };
}

/**
 * Keep only answers whose question still exists in live `questions`
 * (archived IDs live in `questions_archived` and must not affect stats).
 */
export function liveQuestionJoinSql(
  answerAlias: string,
  attemptAlias: string,
  questionAlias = 'lq',
): string {
  return `INNER JOIN questions ${questionAlias}
    ON ${questionAlias}.id = ${answerAlias}."questionId"
   AND ${questionAlias}.lang = ${attemptAlias}.lang`;
}

function taggedOrLegacyCategorySql(
  attemptAlias: string,
  categoryFilterExpr: string,
  legacyMatchSql: string,
): string {
  return `(
    ${attemptAlias}.categories @> ${categoryFilterExpr}::jsonb
    OR (
      COALESCE(jsonb_array_length(${attemptAlias}.categories), 0) = 0
      AND ${legacyMatchSql}
    )
  )`;
}

function attemptQuestionIdsMatchCategorySql(
  attemptAlias: string,
  categoryIdExpr: string,
): string {
  return `EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(${attemptAlias}."questionIds") AS elem(qid)
        INNER JOIN questions q
          ON q.id = (elem.qid)::int
         AND q.lang = ${attemptAlias}.lang
        WHERE ${categoryIdExpr} = ANY(q.categories)
      )`;
}
