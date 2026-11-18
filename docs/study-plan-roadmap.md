# Study plan — backend roadmap

Written 2026-11-01. Product side, teoria.com.ge teardown and the frontend half:
`C:/Users/lursm/Desktop/prava/plans/study-plan-roadmap.md` (read it first). **This file wins** over
`docs/study-plan.md` and "Feature 2" in `docs/study-loop-plan.md` where they differ. Kept from
`study-plan.md`: one active plan per (user, category), exam date first, frozen `schedule` jsonb,
auto-rebalance inside `GET active`, `load`, `reminderTime`, lazy `completed`, no cron.

What changes: the unit of a plan is a **lesson** (6–14 questions of one subject), not a subject, and
each day is a **path of steps** (`learn` × n → `review` → `test` = mixed day exam → `exam` every 3rd day → optional `extra` in short plans; review days: `mix` = last extras, `review`, 2 × `exam`) whose completion is
recorded. `CLAUDE.md` rules apply: guard on every route, bounded DTOs, every user query scoped by
`req.user.userId`, no SQL interpolation, idempotent `scripts/ensure-*.ts`.

---

## Reuse (already there)

| Need | Where |
|---|---|
| Questions of a category + subjects | `GET /questions?category&subjects` (`questions.service.findPaged`), `applyQuestionFilters` |
| Per-question history | `question_progress` (`box`, `correctCount`, `wrongCount`, `firstAnsweredAt`, `lastAnsweredAt`, `dueAt`) |
| Mistake reviews | `mistake-trainer` (`trainer-due.query.ts`, `GET /trainer/session`), intervals in `question-progress.constants.ts` |
| Practice answers | `POST /practice-answers` (updates `question_progress`) |
| Tbilisi day | `auth/login-streak.query.ts` |
| Readiness | `user-stats/readiness.*` |
| Schema script pattern | `scripts/ensure-login-streak.ts` |

---

## Phase 1 — builder + public preview (no DB writes)

`src/study-plans/schedule/`

- `teaching-order.constants.ts` — `SUBJECT_TEACHING_ORDER`: signs groups → markings → traffic lights →
  controller → rules → the rest in normal subject order. Subjects not in the list go last.
- `lesson.builder.ts` (pure) — per subject, sort questions (sign number when the question is about a
  sign, else id), cut into lessons. Lesson size = `clamp(ceil(questionsPerDay / 3..5), 6, 14)`.
  Lesson id is stable: `"<subject>-<n>"` + the frozen question id list.
- `schedule.builder.ts` (pure) — lessons → days: interleave neighbouring subjects (round-robin over a
  window of 2–3 subjects), day *i* gets `lessons[i·L/learnDays … (i+1)·L/learnDays)`. Last
  `max(1, round(days × 0.15))` days (min 2 when ≥ 7) = no new lessons, steps `review` + full `exam`.
  Mock exam every 3rd learn day. `minutesPerDay = questions × SECONDS_PER_QUESTION / 60`, `fits` by `load`.
- Specs: 7 / 14 / 28 days, exam in 2 days (cram), more days than lessons, empty subject, all categories
  0–9 produce non-empty days, lesson ids stable across two runs.
- `GET /study-plans/preview?category&days?&examDay?&load?&lang` — public, cached like other public reads.
  Returns days with lesson titles + counts (no question ids).

## Phase 2 — plan, day, steps (JWT)

Tables (`scripts/ensure-study-plans.ts`):

```
study_plans        -- as in docs/study-plan.md (id, userId, category, lang, kind, startDay, examDay,
                   -- load, reminderTime, status, schedule jsonb, rebalancedAt, timestamps)
                   -- schedule.days[i] = { day, lessons: [{ id, subject, questionIds[] }], steps[], exam? , final? }

study_plan_steps
  planId      int FK study_plans ON DELETE CASCADE
  dayIndex    int
  stepId      varchar(32)        -- 'learn-<lessonId>' | 'review' | 'mix' | 'test' | 'exam'
  doneAt      timestamptz
  doneDay     date               -- Tbilisi day it was finished (unlock rule needs it)
  correct     int NULL, total int NULL, stars smallint NULL   -- test only
  PRIMARY KEY (planId, dayIndex, stepId)
```

Routes:

| Route | What |
|---|---|
| `POST /study-plans` | Create (old active plan of that category → `abandoned`, same transaction) |
| `GET /study-plans/active?category` | Plan, `todayIndex`, days with step status `done/open/locked`, `behind`, `rebalanced?`. `null` when none |
| `GET /study-plans/:id/days/:index?lang` | The day's steps; each step carries its questions in the `GET /trainer/session` shape (one fetch per day for the front). `review` = due mistakes (max 12, only when ≥ 4); `test` = mixed day exam (yesterday's extra tickets + today's + 3 older, ~½ of the full exam, up to 40); `mix` (review days) = the last learn day's extras; `extra` (short plans, optional) = an even share of the tickets not taught |
| `POST /study-plans/:id/days/:index/steps/:stepId` | Mark done. `learn-*` / `mix` / `review`: server checks every question of the step has a `question_progress.lastAnsweredAt ≥ plan.createdAt` (no trust in the client). `test`: body = `{ answers: [{questionId, chosenAnswer}] }` (bounded to the step's ids), graded server-side, also written through the practice-answer path so mistakes enter the trainer; stars from the category's mistake ratio |

- Unlock rule: day N+1 is open when day N is done and `doneDay(N) < today`; when `behind`, one extra
  day may be opened per Tbilisi day. Locked → 409 on step POST.
- Day done = all steps except `review` done, or `test` done.
- `:id` routes load by `{ id, userId }`, else 404. `index` bounded to the schedule length.

## Phase 3 — missed days, edits, `/auth/me`

- Auto-rebalance in `GET active` as in `docs/study-plan.md`, moving **lessons** not done to the remaining
  learn days; `rebalanced: { movedLessons, fromDays }`.
- `PATCH /study-plans/:id` — `examDay`, `load`, `reminderTime`, `status: 'abandoned'`.
- `GET /auth/me` gains `plan: { categoryId, dayIndex, stepsDone, stepsTotal }[]` next to `trainer`
  (the header bell reads it).

## Phase 4 — guest answers after signup

- `POST /practice-answers/bulk` (JWT, throttled, ≤ 200 items, each `{ questionId, chosenAnswer, answeredAt }`,
  `answeredAt` clamped to now − 7 d … now). Graded server-side, same upsert as the single route.
  Also closes product-roadmap item 3 ("guest progress after signup").

## Phase 5 — spaced review of known questions + score

- `question_progress`: a correct answer on a non-mistake row moves `box` up and sets a `reviewAt`
  (new nullable column, separate from `dueAt` so the trainer's mistake logic stays untouched).
  Intervals `KNOWN_REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30]`. Backfill: rows with `correctCount > 0`
  and no `dueAt` get `reviewAt` from `lastAnsweredAt`.
- `GET /trainer/session?scope=review|mistakes` (default `mistakes`, unchanged response).
- Day score = answers + 3 × finished steps, from `study_plan_steps`. Use it for a real weekly leaderboard
  **or** drop the leaderboard (backend roadmap §1 "Leaderboard guard" decision). No filler users.

## Phase 6 — extras (only with usage data)

- `pairs`: group questions by normalised text, keep groups with ≥ 2 different correct answers and images;
  precompute in a script into a small `question_pairs` table.
- `speed`: sign questions with short answers; nothing new server-side except a filter.
- Reminders at `reminderTime` (web push via the PWA, opt-in, a `push_subscriptions` table).

---

## Build order / effort (rough)

| Phase | Backend | Depends on |
|---|---|---|
| 1 | builder + spec + preview — S/M | — |
| 2 | 2 tables, 4 routes, step checks + specs — M/L | 1 |
| 3 | rebalance + PATCH + `/auth/me` block — M | 2 |
| 4 | bulk answers — S | — (can ship any time) |
| 5 | `reviewAt` column + backfill + scope + score — M | 2 |
| 6 | pairs table / push — M each | 5 |

Before phase 2: run on `dev` and check `question_progress` volumes / query plans (`study-loop-plan.md`
"Not verified" still applies) and decide migrations vs `ensure-*` (`docs/roadmap.md` §3).
