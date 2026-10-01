import {
  answerJoinedCategorySql,
  attemptMatchesCategorySql,
  attemptMatchesCategoryWhere,
} from './attempt-category-filter.util';

describe('category match SQL', () => {
  it('named and positional forms describe the same predicate', () => {
    const named = attemptMatchesCategoryWhere('t', 1);
    const positional = attemptMatchesCategorySql('t', '$2', '$3');
    const namedAsPositional = named
      .replaceAll(':categoryFilter', '$2')
      .replaceAll(':categoryId', '$3');
    expect(positional).toBe(namedAsPositional);
  });

  it('keeps the legacy empty-categories fallback', () => {
    const sql = attemptMatchesCategorySql('t', '$2', '$3');
    expect(sql).toContain('t.categories @> $2::jsonb');
    expect(sql).toContain('jsonb_array_length(t.categories)');
    expect(sql).toContain('jsonb_array_elements_text(t."questionIds")');
    expect(sql).toContain('$3 = ANY(q.categories)');
  });

  it('answer join uses the answer question id instead of unnesting the ticket', () => {
    const sql = answerJoinedCategorySql('t', 'a', '$2', '$3');
    expect(sql).toContain('t.categories @> $2::jsonb');
    expect(sql).toContain('q.id = a."questionId"');
    expect(sql).not.toContain('jsonb_array_elements_text');
  });
});
