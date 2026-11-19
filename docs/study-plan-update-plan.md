# Study plan: saved progress, research and update plan

Written and last updated 2026-11-19. This covers how a user's study-plan progress is saved: backend `src/study-plans/` and
frontend `prava/src/utills/helpers/hooks/useStudyPlan.ts`. The schedule builder itself is out of scope.
State and scripts: `docs/study-plan-status.md`. Product decisions: frontend `plans/study-plan-handoff.md`.

## Progress

| Phase | State (2026-11-19) |
|---|---|
| 0. Confirm prod | Partly answered: the owner says the plan is live on prod and users are working through it (2026-11-19). Still open: row count and the error rate of `PUT /study-plans/me`. |
| 1. Stop losing progress | Done on branch `feat/study-plan-sync` (frontend). |
| 1b. Recover old offline progress | Done (owner's yes, 2026-11-19). Progress the old frontend kept only in the guest key `prava.studyPlan.v1` while the account was unreachable is merged once on load when it is the same plan (category, length, start day): every done step (earliest date), the better test per day, mistakes from both; anything out of shape is skipped. A different plan in that key is left alone. Event `plan_progress_recovered`. (`mergeProgress` in `studyPlanActions.ts`.) |
| 2. Revision check | Done on branch `feat/study-plan-sync` (both repos). Local `prava-pg` has the column; prod does not yet. |
| Umami events | Done (frontend): `plan_start`, `plan_reset`, `plan_step_done`, `plan_day_test`, `plan_day_done`, `plan_guest_moved`. No per-plan id yet; adding one would need a field in the saved progress. |
| 3. Schedule changes | Low priority (owner, 2026-11-19: the plan is live with active users; questions and signs won't change for a while). Ship it **before** the next change to the schedule builder, its constants (`STUDY_PLAN_DEPTH_*`, lesson / exam sizes, review days) or `daySessionSeed`; those shift live users' ticks just like a bank change. Owner chose (2026-11-19): finished days stay finished, an unfinished changed day starts fresh. |

What changed:
- Backend: `study_plans.revision` (int, default 1), `GET` returns it, `PUT` takes optional `baseRevision`
  (0 = create only, n = only over revision n, absent = old upsert). 409 body: `{ message, plan }`, where
  `plan` is the current plan, or null when it was deleted. Statements in `saved-plans.sql.ts`, each one
  atomic. No request that works today gets a 400 or 409: `baseRevision` is optional.
- Frontend (`src/utills/helpers/`): `studyPlanActions.ts` (pure progress actions, moved out of the hook),
  `studyPlanMerge.ts` (pure: guest-key plan on sign-in, 1b merge), `studyPlanAccountStorage.ts` (browser copy,
  validated on read), `studyPlanAccount.ts` (account store: load, queue, save, 409 replay, retry),
  `planAnalytics.ts` (Umami). Unsaved changes are kept per user in localStorage `prava.studyPlan.account.v1.<userId>`, applied
  again after a 409 or after being offline, and retried after 2 / 8 / 30 s and on focus / online. Offline
  with no copy in the browser, the page shows a load error instead of the picker, so starting a plan there
  can't overwrite the account's plan. `PlanSaveAlert` (with retry) is on the day page. A new frontend
  against the old API still works: the API ignores unknown fields, and a missing `revision` means saves
  go without `baseRevision`.

Verified: backend tsc, eslint, full jest (447; save statement choice in `planWriteQuery`, pinned by specs); the three statements run against the local `prava-pg`
inside a rolled-back transaction (create, second create → no row, update on the right revision, update on
a stale revision → no row, legacy upsert bumps the revision); frontend tsc and eslint on the changed files;
frontend `npm test` (Vitest, added for this; 37 specs next to the code: `studyPlanActions`, `studyPlanMerge`,
`studyPlanAccountStorage`, and `studyPlanAccount` against an in-memory API with the server's revision rules:
409 replay, offline → reload → back online, retry timer vs a 400, reset on another device, new plan over a
conflict, old API, guest plan moved, 1b merge, a different guest plan left alone). The specs fail when the 409
handling is turned off, so they catch a regression.
Run on localhost on 2026-11-19 (local DB with the `revision` column, API :3000, frontend :3001, signed in):
real `PUT`s through Nest (right revision → 200, stale → 409 with the plan, create-only on an existing plan →
409, no `baseRevision` → 200 and a revision bump, negative → 400). In the UI: another "device" saved first,
then a correct answer in the day's mistakes round went 409 → re-applied → 200, and both changes stayed on the
server. With saves blocked in the tab, a second answer showed `PlanSaveAlert`, kept the change in
localStorage, and sent it after a reload (revision 6). The local plan was put back to its pre-test content
afterwards. Not run: two real devices, a real network outage (simulated by blocking the request), the
unreachable state (offline with no browser copy) in the UI.

Size: hardening, not a bug fix (owner's summary, 2026-11-19). The live version saves correctly on one device
with a working connection; this branch covers the rarer cases (connection drops, a failed save, a second
device or tab, API restarts during a deploy) and adds the usage events.

Deploy order (the plan is live, users are mid-plan):
1. `scripts/sql/08-study-plan-revision.sql` on prod **before** the API. The entity now reads `revision`, so
   without the column `GET /study-plans/me` fails for every signed-in user. Adding a column with a fixed
   default is a metadata-only change in Postgres 11+ (no rewrite, no long lock); existing plans get revision 1.
2. The API. Open tabs still run the old frontend, which saves without `baseRevision` (still accepted, last
   write wins). Rolling back the API is safe: the old one ignores the column.
3. The frontend.
4. Smoke test on prod: sign in, finish one step, reload, the step is still done.

## 1. How it works today (before this update)

| Part | What it does |
|---|---|
| Server | `study_plans`, one row per user: `categoryId`, `dayCount`, `startDay`, `examDay`, and `progress` jsonb `{done, tests, mistakes}`. The days themselves are not stored; they are rebuilt from the live question bank on every request. |
| API | `GET/PUT/DELETE /study-plans/me` (JWT). `PUT` replaces the whole row (upsert); the last write wins. `parsePlanProgress` checks every key, date and score, with size caps. |
| Client | The client decides the progress. Each action (`markStepDone`, `recordTest`, `addMistakes`, `fixMistake`) is a pure function over the plan. The result goes out as a full `PUT`, with saves queued one after another **within one tab**. |
| Guest | Same shape in localStorage `prava.studyPlan.v1`. It moves to the account on the first sign-in when the account has no plan. |
| Per question | Every answer inside the plan also goes to `POST /practice-answers` (coverage, `question_progress`). |

What works well, and should stay:
- Sending the whole plan heals itself: after a failed save, the next successful save carries everything.
- Validation is tight and the row is small. The client and the server use the same caps.
- Per-question learning state lives in `practice_answers` / `question_progress`, not in the plan.

## 2. Findings

Ordered by how likely a real user is to lose progress.

### F1. Progress made "offline" is thrown away (frontend, bug)
If `GET /study-plans/me` fails, the hook switches to `mode = "guest"`, and every change is written to
localStorage. On the next load with the server up, `loadAccount` finds the server plan. It moves the
local copy only when the server has **no** plan, so the offline progress is ignored. The stale copy stays in
localStorage until a later sign-in with no server plan picks it up as if it were new.
`useStudyPlan.ts`, `loadAccount`.

### F2. Save failures can't be seen during the day, and nothing retries (frontend)
`saveFailed` / `offline` are shown only on the plan home (`StudyPlanPageClient` → `PlanSaveNotice`).
`PlanDayClient`, where all steps and tests happen, ignores both. A failed `PUT` is not retried; only the
next action saves again. If the user finishes the day's last step and closes the tab, that step is lost.

### F3. Two devices or tabs overwrite each other (both sides)
The save queue orders saves only within one tab. An older copy in another tab or device, saving
one small change, replaces newer progress without any error. Nothing on the server can notice this today.

### F4. Progress is tied to day/step positions while the days are rebuilt from the live bank (both sides)
`done["3"]["2"]` means "day 3, step 2" of whatever the schedule is *now*. Things that change the schedule
under a saved plan:
- question bank changes (archive/restore, as on 2026-11-16);
- card reseeds / new manual links (`db:seed-cards`, `db:link-sign-cards`);
- builder changes (the `carryPerCard` change on 2026-11-18);
- `daySessionSeed` changes (it reshuffles every day exam).

Result: ticks land on other steps, finished days look unfinished or the reverse, and day mistakes point at days
whose content moved. Nothing detects it. Already listed as "Schedule drift" in the frontend handoff.

### F5. Picking a new plan wipes the old progress without a trace (product)
`start()` commits `{done:{}, tests:{}, mistakes:{}}` over the existing row; MVP allows one plan per user.
Reset asks for confirmation first (checked 2026-11-19), but there is no history to undo from.

### F6. Smaller items
- `PUT` without `mistakes` clears them (known, accepted while every client sends them).
- `getDay` / `getPreview` build the schedule from **today**, not the saved `startDay`. Only the `date`
  field differs; the frontend recomputes dates from `plan.startDay`, so this is harmless today, but the
  response's `date` is wrong for a saved plan.
- The server has no "current day" and no "day completed on" field; both are worked out in frontend helpers
  (`dayDoneOn`, `currentDayIndex`). Reminders (roadmap "Daily 5") and completion stats would have to copy
  that logic.
- No analytics: the owner can't see how many users start a plan, finish day N, or drop out.
- (Fixed 2026-11-19) `docs/study-plan-status.md` said "Not merged, not deployed".
- Prod: live with users per the owner; save error rate not checked.

## 3. Options considered

| Concern | Options | Choice |
|---|---|---|
| Concurrent writes (F3) | (a) keep last-write-wins; (b) `revision` check → 409 + client replays its pending actions; (c) action endpoints (`POST .../steps`, `.../tests`) merged on the server with `jsonb_set` | **(b)**. Few changes, keeps the self-healing full save, and the same replay fixes F1. (c) is cleaner but means 4 routes and moving all progress rules to the server; revisit if (b) gets messy. |
| Version value | `updatedAt` timestamp vs integer `revision` | **`revision int`**. `timestamptz` keeps microseconds and JS `Date` only milliseconds, so comparing timestamps is fragile. |
| Schedule drift (F4) | (a) store a snapshot of the schedule per plan (~30 KB); (b) global `SCHEDULE_VERSION` constant; (c) per-day content hash from the server, stored with progress | **(c)**. Also catches bank and card changes that don't touch code (which (b) misses), costs ~8 chars per day, and lets an unchanged day keep its ticks. (a) is the fallback if the owner wants plans fixed for good. |
| What happens to a changed day | drop its ticks / keep / ask the user | A **finished** day stays finished (an explicit `completed` record); a **started, unfinished** day whose content changed loses its step ticks, and the user gets a one-line note. Owner to confirm. |

## 4. Plan

Order: confirm prod first, then stop losing data (cheap, frontend only), then the server-side guarantees.
Every backend phase follows `CLAUDE.md`: tsc + eslint + jest, an idempotent schema script with SQL for the
Coolify terminal, and a run on `dev` before `main`.

### Phase 0. Confirm prod (no code, ~15 min, owner)
- In the Coolify psql terminal: `\d study_plans` and
  `SELECT count(*), max("updatedAt") FROM study_plans;`. If the table is missing, run
  `scripts/sql/06-ensure-study-plan-tables.sql`.
- API logs: count of non-2xx `PUT /study-plans/me` (400 = a client sending something the server rejects;
  500/502 = table or deploy problem).
- Fix the stale "Not merged, not deployed" line in `docs/study-plan-status.md`.

### Phase 1. Stop losing progress (frontend only, ~1 day)
1. **Pending-action log.** Next to the plan, keep the list of actions not yet saved (`{op, args}`), mirrored
   in localStorage under a per-user key. An action is removed once a `PUT` that contains it succeeds.
2. **Replay on reconnect (fixes F1).** When `loadAccount` gets the server plan and pending actions exist,
   apply them on top of the server plan with the existing pure functions (`withStepDone`, `withTest`,
   `withMistakes`, `withoutMistake`), save, then clear the log. Offline mode writes to the log, not to
   the guest key.
3. **Retry (F2).** Retry a failed save with backoff (2 s, 8 s, 30 s), and again on `online`, on
   `visibilitychange` (hidden), and when the tab regains focus.
4. **Visible (F2).** Render `PlanSaveNotice` in `PlanDayClient` too.
5. **F5.** Checked 2026-11-19: already covered. The picker shows only when there is no plan, and reset asks
   first (`PlanHome`, `resetConfirm`).

Verify: unit tests for the replay (each action type, duplicate actions, a fix after an add). By hand:
DevTools offline → finish a step → back online → reload → the step is still done; two tabs.

### Phase 2. Detect conflicting writes (backend + frontend, ~1 day)
Backend:
- `study_plans.revision int NOT NULL DEFAULT 1` (built with 1, so existing rows start at 1 and
  `baseRevision: 0` can mean "I saw no plan"); `scripts/ensure-study-plans.ts` gets
  `ADD COLUMN IF NOT EXISTS`; new `scripts/sql/08-study-plan-revision.sql`.
- `GET` returns `revision`. `PUT` takes an optional `baseRevision` (`@IsOptional @IsInt @Min(0)`).
  - present: `UPDATE … SET …, revision = revision + 1 WHERE "userId" = $1 AND revision = $2 RETURNING revision`;
    0 rows → **409** with the current plan in the body (saves the client a GET).
  - `baseRevision` absent: today's upsert, unchanged, so older clients keep working. No input that works
    today returns 400 or 409.
  - creating a plan (no row yet) with `baseRevision: 0` inserts with `ON CONFLICT DO NOTHING`; if nothing is
    inserted → 409.
- Specs: matching revision, stale revision → 409 + body, absent → old behaviour, revision bump.

Frontend:
- Keep `revision` with the account plan; send it as `baseRevision`; on 409 take the server plan from
  the body, replay the pending actions (Phase 1), and save again (at most 3 tries, then `saveFailed`).

Once every client sends `baseRevision` and `mistakes`, F6's "absent `mistakes` clears them" can be
changed to "absent = keep" without a separate fix.

### Phase 3. Detect schedule changes (backend + frontend, ~1.5 days, owner decision first)
Backend:
- `PlanDay.hash`: a short hash of the day's content (step kinds, `lessonId`s, question ids per step, seed).
  Computed once in `buildSchedule`, cached with the schedule, and returned in preview and day responses.
- Saved progress gets `dayHashes: { [day]: string }` (only days with progress, at most 60 × 16 chars) and
  `completed: { [day]: 'YYYY-MM-DD' }` (the day's required steps were done that study day). Both are
  checked in `parsePlanProgress`, optional for older clients. This lives in the jsonb, so no column change.
- Build the schedule from the saved `startDay` when one is given (optional `start` query param), so `date`
  is right for saved plans (F6). Check the cache key: `dayCount|startDay` already covers it.

Frontend:
- When a step is ticked, store the day's `hash`; when the day's required steps are done, write `completed[day]`.
- On load, for each day with progress whose hash no longer matches: if it is in `completed`, keep it done;
  otherwise drop its step ticks and test, and show "This day was updated, its steps start fresh".
- `dayDoneOn` / `currentDayIndex` read `completed` first (plans saved before it existed fall back to today's logic).

Owner decided (2026-11-19): keep finished days, reset changed unfinished ones. Not the snapshot.

### Phase 4. Visibility for the owner (backend, ~0.5 day, optional)
- Read-only script `npm run report:study-plans` (no writes): plans by category and length, active in the last
  7 days, and how many reach day 1 / 3 / 7 / the end, based on `completed` (Phase 3). Pure SQL over the jsonb.
- With `completed` on the server, the planned reminders (roadmap "Daily 5") can tell a user's current day
  without copying frontend logic.

### Phase 5. Cleanup (when touching the files anyway)
- Shared `AuthRequest` type (declared in three controllers).
- `CardLessonQueryDto` / `PlanPreviewQueryDto` take category / subject bounds from constants.
- The 3-day T/S day (~490 full questions in one response): send ids and load the extra round lazily, if
  3-day plans get used.

## 5. Owner questions
Answered 2026-11-19:
- Schedule change: finished days stay finished, an unfinished changed day starts fresh (Phase 3).
- The mock `exam` step counts as done even when failed: yes, intended (taking it is the step).
- 1b (recover old offline progress): yes, built.

Open:
1. Picking a new plan: confirm and discard (current behaviour), or keep the old plan's history?
2. Georgian / Russian wording of `saveFailedNotice` and `offlineNotice` (frontend `messages/*.json`).
3. Privacy policy: a line about anonymous usage events (Umami).

## 6. Still not verified
- Prod: `study_plans` row count, error rate of `PUT /study-plans/me`, whether old offline progress exists in
  users' browsers (1b).
- F1 was found by reading the code; the new behaviour was checked in the browser with a simulated outage only.
