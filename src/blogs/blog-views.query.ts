/**
 * Atomic view bump for POST /blogs/:id/view.
 *
 * Wrapped in a CTE so TypeORM's `query()` returns plain rows: a bare
 * `UPDATE ... RETURNING` comes back as `[rows, rowCount]` from the pg driver.
 * No row means the blog does not exist.
 */
export const INCREMENT_BLOG_VIEWS_SQL = `
WITH bumped AS (
  UPDATE blogs
  SET "viewsCount" = "viewsCount" + 1
  WHERE id = $1
  RETURNING "viewsCount"
)
SELECT "viewsCount" FROM bumped
`;

export type IncrementBlogViewsRow = { viewsCount: number | string };
