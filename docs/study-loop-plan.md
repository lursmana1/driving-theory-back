# Study loop plan — mistake trainer + study plan (backend)

Status: **mistake trainer built** on branch `feat/mistake-trainer` (2026-10-27), local only.
Study plan: proposal, not built. Supersedes the "do not build yet" note in
`docs/future-plan.md` for the trainer, and pulls the "spaced-repetition schedule store" from
the roadmap's *Next* list forward, because both features need the same per-question state.

## Why the existing APIs are not enough

| Gap | Where | Effect on the features |
|-----|-------|------------------------|
| `practice_answers` keeps only the **last** answer per (user, question, lang) | `practice-answers.service.ts` upsert | Cannot tell "fixed it" from "guessed right once"; no history for practice drills |
| `weak-questions` returns **5** rows (`TOP_COUNT`) | `weak-stats.query.service.ts` | A trainer built on it can drill at most 5 questions |
| Two different "mistake" definitions | `WeaknessService` (net wrong−right, last 500) vs weak-questions (correct rate < 0.6, all time) | A question the trainer clears can stay on the profile chart, or the reverse |
| Every read rescans history | `combinedGradedAnswersCte` unions all `user_answers` + `practice_answers` | Fine for a profile page; too heavy for "next 20 cards" on every session for every user |
| A mistakes-only `exam_attempt` with the official size and no subjects counts as a **full exam** | `attempt-stats.query.service.ts` (`jsonb_array_length = rule.questionCount AND subjects = []`) | A hard, biased ticket would drag readiness down; its correct answers also count on the leaderboard |

So: one small state table, written on every graded answer, read by both features.

## Core: `question_progress` (one row per user × logical question)

Question ids are shared across ka/ru/en (`question.entity.ts`), so progress is **per question id,
not per lang**. Switching language keeps your mistakes.

```
question_progress
  userId           int  FK users ON DELETE CASCADE
  questionId       int
  wrongCount       int  default 0
  correctCount     int  default 0
  box              smallint default 0  -- correct due reviews since the last wrong answer
  reviewsLeft      smallint default 0  -- reviews still needed to clear; 0 = not a mistake
  lastResult       boolean
  firstAnsweredAt  timestamptz
  lastAnsweredAt   timestamptz
  lastReviewedAt   timestamptz NULL    -- last answer given while due
  dueAt            timestamptz NULL    -- NULL = not an active mistake
  clearedAt        timestamptz NULL    -- set when the last review clears it
  PRIMARY KEY (userId, questionId)
  INDEX (userId, dueAt) WHERE dueAt IS NOT NULL
```

### Update rule (one `INSERT … ON CONFLICT DO UPDATE`, no read-modify-write race)

Full rules and examples: `docs/mistake-trainer-review-logic.md`.

- **Wrong:** `wrongCount+1`, `box=0`, `dueAt=now`, `clearedAt=NULL`,
  `reviewsLeft = clamp(3 − correctCount + wrongCount, 1, 3)` (`MISTAKE_MAX_REVIEWS`): a question
  with a good record needs fewer reviews, a fresh mistake needs 3.
- **Correct while due** (`dueAt <= answer time`): `reviewsLeft−1`, `box+1`; the last review clears
  it (`dueAt=NULL`, `clearedAt` set), otherwise `dueAt = start of Tbilisi day + interval[box]`
  with `MISTAKE_REVIEW_INTERVAL_DAYS = [1, 3, 7]`.
- **Correct before it is due:** counted, schedule unchanged (no same-day cramming).
- Correct answers on a question never answered wrong do not schedule anything.

**Active mistake** = `dueAt IS NOT NULL`. **Cleared** = `clearedAt IS NOT NULL`.
This becomes the one definition; the profile weak-questions chart should move to it later so
the chart and the trainer agree (separate change, listed below).

Days use `Asia/Tbilisi`, same as the login streak.

### Write paths

1. `POST /exam-attempts/:id/answer` — add a CTE to `SUBMIT_ANSWER_SQL` that upserts progress
   **only when the `user_answers` insert returned a row** (`ON CONFLICT DO NOTHING` already
   makes duplicates a no-op, so progress stays idempotent too). Still one round trip.
2. `POST /practice-answers` with a `chosenAnswer` — upsert progress in the same transaction.
   Seen-only calls (no answer) do not touch progress.
3. Answers after an exam's `endDate` that are rejected must not write progress.

### Backfill (idempotent script, required before reads go live)

`npm run db:ensure-question-progress`:
- `CREATE TABLE IF NOT EXISTS` + indexes; `ADD COLUMN IF NOT EXISTS "reviewsLeft"` for tables made
  before it (active mistakes get the reviews the old schedule still owed).
- Rebuild rows from `user_answers` ∪ graded `practice_answers` in answer order, live questions
  only, with `INSERT … ON CONFLICT (userId, questionId) DO UPDATE` so re-running converges.
- Practice history is only the last answer, so backfilled boxes are approximate. Acceptable:
  the schedule self-corrects after one review.
- Prints target host + row counts; never runs from `npm test`.

## Feature 1 — Mistake trainer

Untimed drill. **Not** an `exam_attempt`, so readiness and leaderboard stay clean and there is no
timer or ticket size to fake.

| Route | Guard | Purpose |
|-------|-------|---------|
| `GET /trainer/summary?category=` | JWT | `{ activeMistakes, dueNow, clearedRecently, nextDueAt }` for the profile badge — one indexed count |
| `GET /trainer/session?category=&subjects=&limit=&lang=` | JWT | Up to `limit` (default 20, max 50) full questions, **due first** (`dueAt <= now`, most reviews left, most wrongs), then other active mistakes. Live questions in `lang` only, category via `= ANY(q.categories)` |

Answering reuses `POST /practice-answers`. Its response gains an additive `progress` object
(`{ status, due, dueAt, reviewsLeft, wrongCount, correctCount }`, `null` for seen-only calls) so
the UI can show "cleared!" without a refetch — no existing field changes, no new 400s.

DTO: `category` 0–9 required, `subjects` ≤ 50 ids, `limit` 1–50, `lang` via `parseLang`.
Every query is `WHERE userId = req.user.userId`.

Empty state: if the user has no active mistakes, `session` returns `[]` and `summary` zeros —
the frontend offers "take an exam" instead.

## Feature 2 — Study plan

A daily to-do computed on read from settings + progress. No cron, no per-day rows.

```
study_plans
  userId      int PK FK users ON DELETE CASCADE
  categoryId  int        -- 0..9
  examDate    date NULL  -- optional; drives the pace
  dailyNew    int        -- new questions per day when no examDate (default 20, 5..100)
  createdAt, updatedAt
```

| Route | Guard | Purpose |
|-------|-------|---------|
| `PUT /study-plan` | JWT | Create/replace settings (`categoryId`, `examDate?` today..+365d, `dailyNew?`) |
| `GET /study-plan` | JWT | Settings, or 404 when the user has none |
| `DELETE /study-plan` | JWT | Remove the plan |
| `GET /study-plan/today` | JWT | Today's tasks with targets and done counts |

`today` returns three tasks:

1. **Review** — target `min(dueToday, 40)`; done = progress rows answered today that were due.
   Action: `GET /trainer/session`.
2. **Learn new** — target `examDate ? ceil(unseen / max(daysLeft − 3, 1))` clamped 10..80,
   else `dailyNew`; done = questions whose first answer was today. Suggests the subject with the
   lowest coverage (reuse `subject-progress` logic). Action: `GET /trainer/new?category=&subject=&limit=`
   (unseen live questions; same response shape as `session`).
3. **Mock exam** — required every 3rd day, daily in the last 7 days before `examDate` or once
   coverage ≥ 65 %; done = a full exam completed today. Action: existing `POST /exam-attempts/start`.

Plus `daysLeft`, `onTrack` (unseen ≤ days × pace), and `readyForExam` from the existing readiness
service — no second scoring engine.

"Unseen" and "first answered today" come from `question_progress` (row exists, `firstAnsweredAt`).

## Build order (each step shippable alone)

1. `question_progress` entity + ensure/backfill script + both write paths + unit specs.
   Run the script on `dev`, compare counts against `user_answers`/`practice_answers`.
2. Trainer: `summary` + `session` + `progress` in the practice-answers response.
   → Frontend can ship the mistake trainer (roadmap item 1) and chart → question (item 2).
3. Study plan: `study_plans` + script + four routes + `trainer/new`.
4. Follow-ups (separate PRs): weak-questions chart on the new definition; spaced-repetition
   notifications (Daily 5) read `dueAt`; optional timed "exam from mistakes" — needs an
   `exam_attempts.kind` column so readiness/leaderboard can exclude it.

## Load notes

- Writes: +1 single-row upsert per graded answer, inside the existing statement/transaction.
- Reads: trainer and plan hit `(userId, dueAt)` / PK — no history scans.
- Table size ≈ users × distinct questions answered (bounded by the ~1–2k question bank per user).

## Decisions needed from the owner

1. ~~Graduation~~ — decided 2026-10-27: at most 3 reviews, fewer for a good answer record
   (see `docs/mistake-trainer-review-logic.md`).
2. Study plan: one plan per user, or one per category?
3. Is an untimed trainer enough for launch, or is a timed mistakes exam required (step 4)?

## Not verified

Steps 1–2 are built and unit-tested only. The SQL against a real database, volumes, query plans
and the backfill runtime must be checked on `dev`. Step 3 is not built.
