# Mistake trainer — review logic

One wrong answer makes a question a **mistake**. How many correct reviews it needs to clear depends
on the question's answer record:

```
reviews needed = 3 − correct answers + wrong answers (this one included), kept within 1..3
```

Code: `src/question-progress/question-progress.sql.ts` (the rules),
`src/common/constants/question-progress.constants.ts` (`MISTAKE_MAX_REVIEWS`, the intervals),
`src/question-progress/question-progress.util.ts` (what the API returns).

## States

Each user has one `question_progress` row per question id. Ids are shared across ka/ru/en, so
switching language keeps the user's mistakes. Exam answers (`POST /exam-attempts/:id/answer`) and
graded practice answers (`POST /practice-answers` with `chosenAnswer`) both update the row.

| Status    | Meaning                                     | Stored as                      |
| --------- | ------------------------------------------- | ------------------------------ |
| `mistake` | Answered wrong, not cleared; in the trainer | `dueAt` set, `reviewsLeft` ≥ 1 |
| `cleared` | Was a mistake, passed its reviews           | `dueAt` NULL, `clearedAt` set  |
| `correct` | Answered, never wrong                       | `dueAt` NULL, `clearedAt` NULL |

## How many reviews

Counted at the moment of the wrong answer, from all graded answers so far (exam and practice):

| Correct before | Wrong (incl. this one) | 3 − correct + wrong | Reviews needed |
| -------------- | ---------------------- | ------------------- | -------------- |
| 0              | 1                      | 4                   | **3** (max)    |
| 1              | 1                      | 3                   | 3              |
| 2              | 1                      | 2                   | 2              |
| 3              | 1                      | 1                   | 1              |
| 10             | 1                      | −6                  | **1** (min)    |
| 3              | 3                      | 3                   | 3              |

A question the user has never known needs the full 3. A slip on a well-known question needs 1.
More wrong answers push it back towards 3. The number is stored in `reviewsLeft` and goes down by
one with each correct due review. The question clears when it reaches 0.

## When reviews are due

The timing hasn't changed: a wrong answer makes the question **due at once**. After each correct
review the next one is due 1, then 3 days later (`MISTAKE_REVIEW_INTERVAL_DAYS = [1, 3, 7]`), at
the **start of the Tbilisi day** (`Asia/Tbilisi`, UTC+4). With at most 3 reviews, the 7-day step
is not reached today. It only applies if `MISTAKE_MAX_REVIEWS` is raised.

| Reviews needed | Review 1 | Review 2 | Review 3 |
| -------------- | -------- | -------- | -------- |
| 3              | now      | +1 day   | +3 days  |
| 2              | now      | +1 day   | —        |
| 1              | now      | —        | —        |

## Answer rules

```
graded answer
 ├─ wrong?                  → reviewsLeft = clamp(3 − correct + wrong, 1, 3), box 0,
 │                            due now, clearedAt = NULL   (from any state, even cleared)
 ├─ correct, not due yet?   → counted only, schedule unchanged
 │   (also: never-wrong question → nothing scheduled)
 ├─ correct, due, reviewsLeft > 1 → reviewsLeft − 1, box + 1, due after the next interval
 └─ correct, due, reviewsLeft = 1 → cleared: dueAt = NULL, clearedAt = now
```

- **Due** means `dueAt <= answer time`.
- `wrongCount` / `correctCount` go up on every graded answer.
- Correct answers before the due date don't touch the schedule, so answering a question five
  times in one evening can't clear it. They do count towards `correctCount`, so they lower the
  reviews needed after a *later* wrong answer.
- Concurrent answers to the same question are serialised by the row lock `ON CONFLICT` takes.

## Example

| When (Tbilisi) | Answer  | correct / wrong | reviewsLeft | Next due      |
| -------------- | ------- | --------------- | ----------- | ------------- |
| Oct 1          | correct | 1 / 0           | 0           | —             |
| Oct 5          | correct | 2 / 0           | 0           | —             |
| Nov 2, 10:00   | wrong   | 2 / 1           | 2           | now           |
| Nov 2, 10:15   | correct | 3 / 1           | 1           | Nov 3, 00:00  |
| Nov 3          | correct | 4 / 1           | cleared     | —             |

## API

All routes are JWT-guarded and scoped to `req.user.userId`.

**`GET /trainer/summary?category=`**

```ts
{ activeMistakes: number; dueNow: number; clearedRecently: number; nextDueAt: Date | null }
```

`clearedRecently` = cleared in the last `TRAINER_CLEARED_WINDOW_DAYS` (7) days.

**`GET /auth/me`** → `trainer` (header badge):

```ts
trainer: { categoryId: number; dueNow: number }[]   // e.g. [{ 1, 117 }, { 2, 57 }]
```

One entry per category the user has taken an exam in (`dueNow` may be 0), most due first.
Questions belong to several categories, so this limits the badge to what the user studies. A user
with no exams yet gets every category with active mistakes. `[]` when there are none.

**`GET /trainer/session?category=&subjects=&limit=&lang=`**

`{ data: { question, progress }[], summary }`. `limit` defaults to 20, max 50. Order: due first,
then most reviews left, most wrong, soonest due, question id.

**`progress`** (also returned by `POST /practice-answers`; `null` for seen-only calls):

```ts
{
  status: 'mistake' | 'cleared' | 'correct';
  due: boolean;          // mistake whose review is due now
  dueAt: Date | null;
  reviewsLeft: number;   // stored reviewsLeft for a mistake (≥ 1), else 0
  wrongCount: number;
  correctCount: number;
}
```

## Changing it

- Max reviews: `MISTAKE_MAX_REVIEWS` (3). Only wrong answers after the change use the new value.
- Timing: `MISTAKE_REVIEW_INTERVAL_DAYS`; the last step repeats if there are more reviews than
  steps.
- Schema: `npm run db:ensure-question-progress` adds `reviewsLeft`. For tables created before it,
  it fills active mistakes from the old box schedule and drops the dev-only `correctStreak`
  column. Safe to re-run.
