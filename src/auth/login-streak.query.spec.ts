import { TOUCH_LOGIN_STREAK_SQL } from './login-streak.query';

describe('TOUCH_LOGIN_STREAK_SQL', () => {
  const sql = TOUCH_LOGIN_STREAK_SQL.replace(/\s+/g, ' ');

  it('counts days on the Georgian calendar, not UTC', () => {
    expect(sql).toContain("(now() AT TIME ZONE 'Asia/Tbilisi')::date");
  });

  it('extends only from yesterday and restarts at 1 otherwise', () => {
    expect(sql).toContain(
      'WHEN u."lastActiveDay" = t.day - 1 THEN u."currentStreak" + 1 ELSE 1',
    );
  });

  it('writes at most once per day', () => {
    expect(sql).toContain('AND u."lastActiveDay" IS DISTINCT FROM t.day');
  });

  it('takes the user id only as a bound parameter', () => {
    expect(sql).toContain('WHERE u.id = $1');
    expect(sql).not.toMatch(/\$[2-9]/);
  });

  it('falls back to the stored row when today was already counted', () => {
    expect(sql).toContain(
      'WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM touched)',
    );
  });
});
