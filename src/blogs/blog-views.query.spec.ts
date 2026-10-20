import { INCREMENT_BLOG_VIEWS_SQL } from './blog-views.query';

describe('INCREMENT_BLOG_VIEWS_SQL', () => {
  const sql = INCREMENT_BLOG_VIEWS_SQL.replace(/\s+/g, ' ');

  it('increments in one statement instead of read-then-write', () => {
    expect(sql).toContain('SET "viewsCount" = "viewsCount" + 1');
  });

  it('takes the blog id only as a bound parameter', () => {
    expect(sql).toContain('WHERE id = $1');
    expect(sql).not.toMatch(/\$[2-9]/);
  });

  it('returns rows through a SELECT so the driver does not return [rows, count]', () => {
    expect(sql.trim()).toMatch(/^WITH bumped AS \( UPDATE blogs/);
    expect(sql).toContain('SELECT "viewsCount" FROM bumped');
  });
});
