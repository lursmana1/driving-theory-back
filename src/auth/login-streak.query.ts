import { studyDaySql } from '../common/sql/study-day.sql';

/**
 * GET /auth/me in one statement: counts today as a visit and returns the user.
 *
 * Days are study days: Tbilisi time, starting at 04:00 (`study-day.sql.ts`),
 * so a visit at 01:30 still belongs to the evening before. The first call of
 * a day extends the streak when the previous visit was yesterday and
 * restarts it at 1 otherwise; later calls the same day write nothing.
 * The UPDATE locks the row, so parallel first calls of a day count once.
 *
 * Only a later day writes (`<`, not `IS DISTINCT FROM`): days stored under
 * the old midnight rule can be one day ahead of the 04:00 rule between 00:00
 * and 04:00, and such a visit must neither reset the streak nor move
 * `lastActiveDay` backwards.
 *
 * The SELECT runs on the statement snapshot and cannot see the CTE's write,
 * hence the UNION: the updated row when there was one, the stored row
 * otherwise. No row means the user does not exist.
 */
export const TOUCH_LOGIN_STREAK_SQL = `
WITH today AS (
  SELECT ${studyDaySql('now()')} AS day
),
touched AS (
  UPDATE users u
  SET "currentStreak" = CASE
        WHEN u."lastActiveDay" = t.day - 1 THEN u."currentStreak" + 1
        ELSE 1
      END,
      "longestStreak" = GREATEST(
        u."longestStreak",
        CASE
          WHEN u."lastActiveDay" = t.day - 1 THEN u."currentStreak" + 1
          ELSE 1
        END
      ),
      "lastActiveDay" = t.day
  FROM today t
  WHERE u.id = $1
    AND (u."lastActiveDay" IS NULL OR u."lastActiveDay" < t.day)
  RETURNING u.id, u.name, u.surname, u.email, u.type,
            u."currentStreak", u."longestStreak"
)
SELECT * FROM touched
UNION ALL
SELECT id, name, surname, email, type, "currentStreak", "longestStreak"
FROM users
WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM touched)
`;

export type MeRow = {
  id: number;
  name: string;
  surname: string | null;
  email: string;
  type: 'admin' | 'user';
  currentStreak: number;
  longestStreak: number;
};
