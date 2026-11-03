# Roadmap (backend)

Replaces the old `.cursor/rules/product-roadmap.mdc` (removed 2026-10-29). The mistake trainer from that
list is shipped. Work top to bottom; do not start an item without an explicit ask.

Rules from `CLAUDE.md` apply to everything below: a guard on every new route, bounded DTOs, every user
query scoped by `req.user.userId`, no SQL interpolation, and an idempotent script for every schema change.

## 1. Fix the gaps that hurt real users

- [x] **Password reset.** Built on `feat/password-reset-study-day` (not deployed). Decided 2026-11-01 (Resend, logout-all via `tokenVersion`, Google-only users can set a password): spec in `docs/phase0-password-reset-study-day.md`. Forgot password does not work: this API has no reset flow, so email users who
      forget their password are locked out. Needs a reset-token table (hashed token, expiry, single use),
      an email sender, and two rate-limited routes (request reset, confirm reset). Decide the email
      provider first.
- [ ] **Leaderboard guard (W4).** `GET /leaderboard` reads `req.user` with no guard, so `currentUser` is
      always `userId: 0`, and anonymous callers see ranked users' ids, names and surnames. Add an
      optional-JWT guard and decide what a public caller may see, or drop the leaderboard from the landing.
- [ ] **W3 constraint in production.** The code tolerates concurrent submits, but the race is only closed
      once the operator removes duplicate `user_answers` rows and runs
      `ALTER TABLE user_answers ADD CONSTRAINT uq_user_answers_attempt_question UNIQUE ("attemptId", "questionId")`.
- [ ] **W12.** Remove the hardcoded `--yes` from `db:clear-exam-attempts` in `package.json`; print the
      target host and row counts and require the operator to confirm.

## 2. Next features

1. [ ] **Bookmarks / review-later drill + flag for review during an exam.** Small `bookmarks` table
       (user, question, created), routes scoped by `req.user.userId`. The drill reuses the mistake
       trainer's session start.
2. [ ] **Quick test.** 10 questions, no timer, as a mode on `POST /exam-attempts/start`.
3. [ ] **Unfinished-exam banner.** `GET /exam-attempts/active`.
4. [ ] **Readiness gate before "book exam".** The readiness score exists; mostly frontend.
5. [ ] **Later:** Daily 5 (email / Telegram), PWA / offline tickets, freemium / paywall, instructor
       (B2B) accounts.

## 3. Engineering groundwork (alongside the above)

- [ ] **CI.** `.github/workflows/` is empty. One workflow running `tsc`, `eslint` and `jest` on every push.
- [ ] **Migrations.** Schema goes out through ad-hoc `scripts/ensure-*.ts`. Move to TypeORM migrations
      before adding the bookmark and reset-token tables.
- [ ] **W5.** Partly done on `feat/password-reset-study-day`: `tokenVersion` check in `jwt.strategy.ts`
      `validate`. Left: read the role from the DB row too.

## Order

Password reset and the leaderboard decision first (both are broken things users hit), then bookmarks /
review-later as the next study-loop feature. Add CI along the way.

Known bugs referenced as W-numbers: `.cursor/rules/known-weaknesses.mdc`. Longer-term notes:
`docs/future-plan.md`, `docs/study-plan.md`.
