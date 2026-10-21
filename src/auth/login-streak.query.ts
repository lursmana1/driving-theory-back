/**
 * GET /auth/me in one statement: counts today as a visit and returns the user.
 *
 * Days are Georgian calendar days (Asia/Tbilisi, UTC+4, no DST). The first
 * call of a day extends the streak when the previous visit was yesterday and
 * restarts it at 1 otherwise; later calls the same day write nothing.
 * The UPDATE locks the row, so parallel first calls of a day count once.
 *
 * The SELECT runs on the statement snapshot and cannot see the CTE's write,
 * hence the UNION: the updated row when there was one, the stored row
 * otherwise. No row means the user does not exist.
 */
export const TOUCH_LOGIN_STREAK_SQL = `
WITH today AS (
  SELECT (now() AT TIME ZONE 'Asia/Tbilisi')::date AS day
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
    AND u."lastActiveDay" IS DISTINCT FROM t.day
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
