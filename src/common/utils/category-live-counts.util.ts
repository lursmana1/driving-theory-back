import type { CategorySubjectRow } from '../../categories/entities/category.entity';
import { parsePgInt } from './pg-row.util.js';

/** One row of `LIVE_CATEGORY_COUNTS_SQL` (raw: numbers may be strings). */
export type LiveCategoryCountRow = {
  category: unknown;
  subject: unknown;
  count: unknown;
};

export type LiveCategoryCounts = {
  /** Live questions tagged with the category, including subject-less ones. */
  total: number;
  /** subject id → live question count (subject-less questions excluded). */
  bySubject: Map<number, number>;
};

/** Group raw (category, subject, count) rows per category. */
export function groupLiveCategoryCounts(
  rows: readonly LiveCategoryCountRow[],
): Map<number, LiveCategoryCounts> {
  const out = new Map<number, LiveCategoryCounts>();
  for (const row of rows) {
    const categoryId = parsePgInt(row.category);
    const count = parsePgInt(row.count);
    let entry = out.get(categoryId);
    if (!entry) {
      entry = { total: 0, bySubject: new Map() };
      out.set(categoryId, entry);
    }
    entry.total += count;
    if (row.subject != null) {
      const subjectId = parsePgInt(row.subject);
      entry.bySubject.set(
        subjectId,
        (entry.bySubject.get(subjectId) ?? 0) + count,
      );
    }
  }
  return out;
}

/**
 * Stored subject catalog (names) with counts replaced by live counts.
 * Subjects with no live questions are dropped. Without a stored catalog the
 * live subjects are listed as `Subject N`.
 */
export function withLiveSubjectCounts(
  stored: readonly CategorySubjectRow[] | null | undefined,
  liveBySubject: ReadonlyMap<number, number>,
): CategorySubjectRow[] {
  if (stored?.length) {
    return stored
      .map((s) => ({ ...s, questionsCount: liveBySubject.get(s.id) ?? 0 }))
      .filter((s) => s.questionsCount > 0)
      .sort((a, b) => a.id - b.id);
  }
  return [...liveBySubject.entries()]
    .sort(([a], [b]) => a - b)
    .map(([id, questionsCount]) => ({
      id,
      name: `Subject ${id}`,
      questionsCount,
    }));
}
