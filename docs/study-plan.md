# Study plan — backend plan

> **Superseded in part (2026-11-01):** see `docs/study-plan-roadmap.md` (lessons instead of whole subjects, step table, phases). Where they differ, the roadmap wins.

Planning notes only. Nothing here is built yet. Frontend side + competitor research: `C:/Users/lursm/Desktop/prava/plans/study-plan.md` (read it first). This file is the backend half, kept in sync with it.

Rules from `CLAUDE.md` apply: a guard on every new route, bounded DTOs, every user query scoped by `req.user.userId`, no SQL interpolation, an idempotent `scripts/ensure-*.ts` for the schema (`DB_SYNCHRONIZE=false`).

---

## What it is

The user sets an exam date (or picks 7 / 14 / 28 days). The backend splits the category's subjects over the days and returns, per day, 2–3 tasks:

- `learn` — answer the day's subjects on `/tickets` (`POST /practice-answers`)
- `fix` — clear yesterday's mistakes (mistake trainer)
- `exam` — finish an exam (`POST /exam-attempts/start` → finish), full or by subjects

Progress is **computed** from answers the user already gives. There is no "mark as done" route.

---

## What already exists (reuse)

| Need | Where |
|---|---|
| Per-subject answers | `practice_answers.subject` + `updatedAt` (one row per user/question/lang, upserted) |
| Exam answers | `user_answers` via `exam_attempts` (`categories`, `subjects`, `completedAt`, `passed`) |
| Graded answers from both | `src/common/sql/combined-answers.sql.ts` (`combinedGradedAnswersCte`) |
| Mastery threshold | `QUESTION_MASTERY_CORRECT_RATIO = 0.6` in `common/constants/exam.constants.ts` |
| Subject progress / weak subjects | `user-stats` (`coverage-stats.query.service.ts`, `weak-stats.query.service.ts`) |
| Question count per subject | `questions` filtered by `applyQuestionFilters` (category, lang) |
| "Day" = Tbilisi calendar day | `auth/login-streak.query.ts` (`now() AT TIME ZONE 'Asia/Tbilisi'`) |
| Schema script pattern | `scripts/ensure-login-streak.ts` (`initPg`, `IF NOT EXISTS`) |

---

## Data — `study_plans` (one table)

| Column | Type | Note |
|---|---|---|
| id | serial PK | |
| userId | int FK users, `ON DELETE CASCADE` | |
| category | int | validated against `category.constants.ts` |
| lang | varchar(5) | question counts / labels |
| kind | varchar(16) | `exam_date` / `express` (7) / `standard` (14) / `relaxed` (28) |
| startDay | date | Tbilisi day of creation |
| examDay | date | always set (presets = startDay + length − 1) |
| load | varchar(8) | `light` / `normal` / `heavy`, default `normal` |
| reminderTime | time null | saved now, used when reminders exist |
| status | varchar(12) | `active` / `completed` / `abandoned` |
| schedule | jsonb | frozen day list (below), rewritten only on rebalance |
| rebalancedAt | timestamptz null | |
| createdAt / updatedAt | timestamptz | |

Indexes:
- `idx_study_plans_user` on (`userId`)
- partial unique `uq_study_plans_active` on (`userId`, `category`) `WHERE status = 'active'`

`schedule` shape (frozen so a question import doesn't move days):

```json
{
  "version": 1,
  "days": [
    { "day": "2026-11-01", "subjects": [3, 4, 5], "questionCount": 96,
      "tasks": ["learn", "fix"] },
    { "day": "2026-11-03", "subjects": [9], "questionCount": 31,
      "tasks": ["learn", "fix", "exam"], "exam": { "subjects": [1,2,3,4,5,6,7,8,9] } },
    { "day": "2026-11-13", "subjects": [], "tasks": ["fix", "exam"], "exam": { "full": true }, "final": true }
  ]
}
```

No per-day progress table in v1. Add one only if the progress query gets slow.

Schema: `scripts/ensure-study-plans.ts` (`CREATE TABLE IF NOT EXISTS` + indexes), same shape as `ensure-login-streak.ts`.

---

## Module `src/study-plans/`

```
study-plans.module.ts
study-plans.controller.ts
study-plans.service.ts
entities/study-plan.entity.ts
dto/create-study-plan.dto.ts      category, kind, examDay?, load?, reminderTime?
dto/update-study-plan.dto.ts      examDay?, load?, reminderTime?, status?: 'abandoned'
dto/preview-study-plan.dto.ts     same as create, query params
schedule/schedule.builder.ts      pure function, no DB
schedule/schedule.builder.spec.ts
schedule/schedule.constants.ts    thresholds (below)
queries/plan-progress.query.ts    one SQL, CTE per day window
queries/plan-progress.query.spec.ts
study-plans.types.ts
```

### Routes

| Route | Guard | What |
|---|---|---|
| `GET /study-plans/preview?category&kind&examDay?&load?` | public | Day list without saving + `minutesPerDay` estimate + `fits: boolean` (load warning). Cache like other public reads (`http-cache.constants.ts`) |
| `POST /study-plans` | JWT | Create. An existing active plan for that category → `abandoned` (same transaction) |
| `GET /study-plans/active?category` | JWT | Plan + `todayIndex` + days with `{ tasks, progress, done, missed }` + `behind` flag. 404-free: returns `null` when there is none |
| `PATCH /study-plans/:id` | JWT | Change `examDay` / `load` / `reminderTime` (→ rebalance) or `status: 'abandoned'` |

- `:id` routes load by `{ id, userId }`; not found → 404 (never 403, don't leak ids).
- DTO bounds: `examDay` = tomorrow … +60 days (Tbilisi), `kind` / `load` `@IsIn`, `reminderTime` `HH:mm`.
- No separate rebalance route: missed days rebalance **automatically** inside `GET active` (see below), and `PATCH` rebalances when date/load change.

---

## `schedule.builder.ts` (pure)

Input: subjects with question counts, `startDay`, `examDay`, `load`, weak subjects (optional), already-mastered subjects (optional).

1. `days = examDay − startDay + 1`. Under 3 → cram mode: every day `fix` + full `exam`.
2. Final block = last `max(1, round(days × 0.15))` days (min 2 when days ≥ 7): no new subjects, `fix` + full `exam`, `final: true`.
3. Learn block = the rest. Mock exam on every 3rd learn day (`exam.subjects` = all subjects learned so far).
4. Split subjects over learn days by **question count** (greedy, normal subject order). Mastered subjects are skipped (smaller plan, research: placement / "already done").
5. Weak subjects get a second slot in the last learn days if there is room.
6. `fits = questionsPerDay ≤ LOAD_LIMIT[load]`; `minutesPerDay ≈ questionsPerDay × SECONDS_PER_QUESTION / 60`.

Constants (`schedule.constants.ts`): `DAY_DONE_ANSWERED_RATIO = 0.8`, `SECONDS_PER_QUESTION = 30`, `LOAD_LIMIT = { light: 25, normal: 50, heavy: 90 }`, `MOCK_EVERY_N_DAYS = 3`, `FINAL_RATIO = 0.15`, `MAX_DAYS = 60`.

Spec cases: 7 / 14 / 28 days, exam in 2 days, more days than subjects, empty subject skipped, all subjects mastered, `light` vs `heavy` same date.

---

## Progress (`plan-progress.query.ts`)

One query, parameters only (`sql-params.ts`), user scoped:

- `learn` progress per day = distinct `practice_answers.questionId` with `subject = ANY(day.subjects)`, `userId`, `updatedAt >= plan.createdAt` (**any lang**, counted per question id) ÷ `day.questionCount`. Done at ≥ `DAY_DONE_ANSWERED_RATIO`. Answers given early (studying ahead) count when that day comes.
- `fix` = wrong answers from the previous plan day (from `combinedGradedAnswersCte`) that are still wrong on the latest answer. Done when 0. Empty → task hidden.
- `exam` = a finished `exam_attempts` row (`completedAt` not null, category in `categories`) whose `completedAt` Tbilisi day **is that day** (research: final exams only count close to the exam). For `final` days, prefer full exams.
- `missed` = day < today and not done. `behind` = ≥ 2 missed days.

`practice_answers` keeps only the latest answer, so "answered" is honest but "fixed" can flip back. That's fine for v1.

---

## Auto-rebalance (in `GET active`)

When `missed` days exist and `rebalancedAt` is before today (Tbilisi):

1. Collect subjects of missed days that aren't done.
2. Rebuild days `today … examDay` with the builder (done days stay as they are).
3. Save `schedule` + `rebalancedAt`, return `rebalanced: { movedSubjects, fromDays }` so the frontend banner can say what moved.

If the remaining load doesn't fit `load`, return `fits: false` (frontend suggests heavier load or a later date). Lighter load cuts new subjects, **never** the `fix` task.

Plan becomes `completed` lazily in `GET active` once `examDay` has passed (no cron).

---

## Later (only after v1 is used)

- `GET /user-stats/summary` gets a small `plan` block (today done / total) so the profile first paint stays one call.
- `study_plan_days` progress table if the query is slow.
- Reminders (`reminderTime`) — needs an email / push provider + opt-in.
- Plan day counts toward the login streak, "streak freeze".
- Spaced review (subject comes back on day +3 / +7) — needs the spaced-repetition fields from the tickets plan.

## Build order

1. `schedule.builder.ts` + spec, `GET /study-plans/preview` (public).
2. `ensure-study-plans.ts`, entity, `POST`, `GET active` with progress query + spec.
3. `PATCH` (date / load / abandon) + auto-rebalance.
4. Summary block on `user-stats/summary`.
