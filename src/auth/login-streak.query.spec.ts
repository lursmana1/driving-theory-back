import { TOUCH_LOGIN_STREAK_SQL } from './login-streak.query';

describe('TOUCH_LOGIN_STREAK_SQL', () => {
  const sql = TOUCH_LOGIN_STREAK_SQL.replace(/\s+/g, ' ');

  it('counts study days: Tbilisi time, starting at 04:00', () => {
    expect(sql).toContain(
      "((now() AT TIME ZONE 'Asia/Tbilisi') - interval '4 hours')::date",
    );
  });

  it('extends only from yesterday and restarts at 1 otherwise', () => {
    expect(sql).toContain(
      'WHEN u."lastActiveDay" = t.day - 1 THEN u."currentStreak" + 1 ELSE 1',
    );
  });

  it('writes at most once per day and never moves the day backwards', () => {
    expect(sql).toContain(
      'AND (u."lastActiveDay" IS NULL OR u."lastActiveDay" < t.day)',
    );
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
