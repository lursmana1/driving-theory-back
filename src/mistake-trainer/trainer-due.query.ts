/**
 * Mistakes due for review per license category, read with GET /auth/me for
 * the header badge, most due first.
 *
 * Questions belong to several categories, so one mistake counts in each of
 * them; listing every category would show badges for categories the user
 * never studies. So: one row per category the user has taken an exam in
 * (`dueNow` may be 0). A user with no exams yet gets every category that
 * has active mistakes. Categories are the same in every language, so the join
 * reads the `ka` row. GET /trainer/summary joins in the request's language
 * instead, so its `dueNow` differs when a question is live in only one of
 * them.
 */
export const TRAINER_DUE_SQL = `
WITH studied AS (
  SELECT DISTINCT (ea.categories->>0)::int AS category
  FROM exam_attempts ea
  WHERE ea."userId" = $1
    AND jsonb_array_length(ea.categories) > 0
),
mistakes AS (
  SELECT c.category,
         COUNT(*) FILTER (WHERE qp."dueAt" <= NOW())::int AS due
  FROM question_progress qp
  INNER JOIN questions q
    ON q.id = qp."questionId"
   AND q.lang = 'ka'
  CROSS JOIN LATERAL unnest(q.categories) AS c(category)
  WHERE qp."userId" = $1
    AND qp."dueAt" IS NOT NULL
  GROUP BY c.category
)
SELECT s.category AS "categoryId", COALESCE(m.due, 0) AS "dueNow"
FROM studied s
LEFT JOIN mistakes m ON m.category = s.category
UNION ALL
SELECT m.category, m.due
FROM mistakes m
WHERE NOT EXISTS (SELECT 1 FROM studied)
ORDER BY "dueNow" DESC, "categoryId" ASC
`;

export type TrainerDueRow = {
  categoryId: number | string;
  dueNow: number | string;
};
