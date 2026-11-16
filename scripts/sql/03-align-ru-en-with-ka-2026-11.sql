-- Step 3a: align ru/en rows with ka (ka is the source of truth; verified against starti.ge 2026-11-12).
--
-- Found on the live bank (local copy of prod, 2026-11-12):
--   * 166 ru/en rows (83 questions) whose correct_answer pointed at the wrong answer.
--     ru/en answers are in ka's order; every case checkable by text against starti's ru/en
--     confirmed the ka index (e.g. #254 "45 km/h", #921 "up to 3500 kg").
--   * 352 ru/en rows with invented extra answers ("None of the above", "No correct answer",
--     "All vehicles pass simultaneously", ...) beyond ka's 2-3 answers. Never marked correct.
--     Whitespace-only placeholders are left untouched.
--   Expected first run on local copy: correct_answer 166, extra_answers 352, UPDATE 517.
--   * categories: copied from ka as well (old AM-tag drift), no-op on the current bank.
--
-- Idempotent: a second run updates 0 rows. Safe before or after 04.

BEGIN;

-- Before: rows that will change
SELECT 'correct_answer' AS fix, COUNT(*) FROM questions o JOIN questions ka ON ka.id = o.id AND ka.lang = 'ka'
 WHERE o.lang IN ('ru', 'en') AND o.correct_answer IS DISTINCT FROM ka.correct_answer
UNION ALL
SELECT 'extra_answers', COUNT(*) FROM questions o JOIN questions ka ON ka.id = o.id AND ka.lang = 'ka'
 WHERE o.lang IN ('ru', 'en')
   AND ((NULLIF(TRIM(ka.answer_3), '') IS NULL AND NULLIF(TRIM(o.answer_3), '') IS NOT NULL)
     OR (NULLIF(TRIM(ka.answer_4), '') IS NULL AND NULLIF(TRIM(o.answer_4), '') IS NOT NULL))
UNION ALL
SELECT 'categories', COUNT(*) FROM questions o JOIN questions ka ON ka.id = o.id AND ka.lang = 'ka'
 WHERE o.lang IN ('ru', 'en') AND o.categories IS DISTINCT FROM ka.categories;

UPDATE questions o
SET
  correct_answer = ka.correct_answer,
  categories = ka.categories,
  -- Only answers with real text beyond ka's count are dropped; '' placeholders are left as they are.
  answer_3 = CASE WHEN NULLIF(TRIM(ka.answer_3), '') IS NULL AND NULLIF(TRIM(o.answer_3), '') IS NOT NULL THEN NULL ELSE o.answer_3 END,
  answer_4 = CASE WHEN NULLIF(TRIM(ka.answer_4), '') IS NULL AND NULLIF(TRIM(o.answer_4), '') IS NOT NULL THEN NULL ELSE o.answer_4 END
FROM questions ka
WHERE ka.id = o.id
  AND ka.lang = 'ka'
  AND o.lang IN ('ru', 'en')
  AND (
    o.correct_answer IS DISTINCT FROM ka.correct_answer
    OR o.categories IS DISTINCT FROM ka.categories
    OR (NULLIF(TRIM(ka.answer_3), '') IS NULL AND NULLIF(TRIM(o.answer_3), '') IS NOT NULL)
    OR (NULLIF(TRIM(ka.answer_4), '') IS NULL AND NULLIF(TRIM(o.answer_4), '') IS NOT NULL)
  );

-- After: expect 0 / 0 / 0
SELECT
  COUNT(*) FILTER (WHERE o.correct_answer IS DISTINCT FROM ka.correct_answer) AS correct_mismatch,
  COUNT(*) FILTER (WHERE (NULLIF(TRIM(ka.answer_3), '') IS NULL AND NULLIF(TRIM(o.answer_3), '') IS NOT NULL)
                      OR (NULLIF(TRIM(ka.answer_4), '') IS NULL AND NULLIF(TRIM(o.answer_4), '') IS NOT NULL)) AS extra_answers,
  COUNT(*) FILTER (WHERE o.categories IS DISTINCT FROM ka.categories) AS category_mismatch
FROM questions o JOIN questions ka ON ka.id = o.id AND ka.lang = 'ka'
WHERE o.lang IN ('ru', 'en');

COMMIT;
