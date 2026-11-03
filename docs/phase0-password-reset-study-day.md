# Phase 0 — password reset + 04:00 study day

Decided by the owner on 2026-11-01. **Merged to `main` in both repos on 2026-11-04** (backend `9cb8abd`, frontend `ef73380`). Prod schema applied 2026-11-04. Email is **not live yet**: waiting for the Resend DNS records, so the backend has no Resend env and the frontend hides the link (`PASSWORD_RESET_ENABLED = false`). Deploy order: run `npm run db:ensure-password-resets` on the target DB **before** the new API starts (the API reads `users.tokenVersion` on every authenticated request). Comes before the
study plan (`docs/study-plan-roadmap.md`). `CLAUDE.md` rules apply (guards, bounded DTOs, user-scoped
queries, no SQL interpolation, idempotent `scripts/ensure-*.ts`).

## Decisions

| Topic | Decision |
|---|---|
| Email sender | **Resend** (API key `RESEND_API_KEY`, sender `EMAIL_FROM`, e.g. `prava.ge <noreply@prava.ge>`). DNS records for prava.ge are set by the owner in Resend's dashboard |
| Google-only accounts | Reset email says "you sign in with Google" **and** contains a link to set a password |
| Sessions after reset | **Log out every device**: `users.tokenVersion int default 0`, put in the JWT, checked in `jwt.strategy.ts` `validate`; reset (and logout-everywhere later) increments it. Also closes W5 |
| Day start | **04:00 Asia/Tbilisi** for streak, trainer due times and (later) the study plan. One constant `STUDY_DAY_START_HOUR = 4` next to `STUDY_TIME_ZONE`, one SQL helper `study_day(ts)` = `((ts AT TIME ZONE 'Asia/Tbilisi') - interval '4 hours')::date` |
| Streak rule | **Unchanged: any visit** (`GET /auth/me`) counts; only the day boundary moves to 04:00 |

## Password reset

- Table `password_resets` (`scripts/ensure-password-resets.ts`): `id`, `userId` FK cascade, `tokenHash`
  (sha256 of a 32-byte random token), `expiresAt` (now + 30 min), `usedAt` null, `createdAt`, `requestIp`.
  Index on `tokenHash`. A new request invalidates earlier unused tokens of that user.
- `POST /auth/forgot-password { email, locale }` — public, throttled (per IP + per email), **always 200**
  with the same body (no account enumeration). Unknown email → no mail.
- `POST /auth/reset-password { token, password }` — public, throttled; token valid, unused, not expired →
  set bcrypt password, `usedAt = now()`, `tokenVersion + 1`, then sign the user in (new cookie).
  Password rules = the register DTO's.
- Email: ka / en / ru by `locale`, plain HTML + text, link `${FRONTEND_URL}/[locale/]auth/reset-password?token=…`.
  Google-only users get the "you use Google" variant with the same set-password link.
- Specs: token hashing/expiry/single use, enumeration-safe response, tokenVersion bump, Google-only variant.

## Study day 04:00

- `login-streak.query.ts`: replace `(now() AT TIME ZONE 'Asia/Tbilisi')::date` with the 04:00 rule.
  Switch-over grace: on the first deploy day, a streak whose `lastVisitDay` is "yesterday" under either
  rule is kept (no one loses a streak because of the change).
- `question-progress.sql.ts`: review due times move from Tbilisi 00:00 to 04:00. Existing `dueAt` values
  stay as they are (they move at most 4 h later on their next review).
- Specs: 23:30 and 01:30 Tbilisi count as the same day; 04:00 starts a new one.

## Frontend (prava)

- `/auth/forgot-password` and `/auth/reset-password` pages (noindex, not in the sitemap), link from `LoginForm`.
- Switch: `PASSWORD_RESET_ENABLED` in `src/CONSTS/features.ts` (a plain constant, not env). While `false` the login link is hidden and `/auth/forgot-password` redirects to `/auth`; `/auth/reset-password` stays reachable.
- `src/api/auth.ts`: `forgotPassword`, `resetPassword`. Copy in `messages/*` under `Auth.*`.
- Small hint where streak / trainer "today" is shown: "the day ends at 04:00".

## Owner to do

1. Create a Resend account, add prava.ge, add its DNS records (SPF/DKIM) at the domain's DNS host.
2. Put `RESEND_API_KEY` and `EMAIL_FROM` in the backend env (local `.env` + Coolify).

## Production rollout (checked 2026-11-02)

Facts: prava.ge DNS is on **AWS Route 53** (`ns-*.awsdns-*`). The root has no MX and no SPF (only a
google-site-verification TXT), so Resend's records cannot clash with anything. `api.prava.ge` resolves
to a server IP (Hetzner/Coolify, per `.env.example`), not Render.

| # | Step | Where | Done when |
|---|---|---|---|
| 1 | Add domain `prava.ge`, region EU (Ireland) | resend.com → Domains | Resend lists the DNS records |
| 2 | Create the records exactly as shown: TXT `resend._domainkey`, MX `send` (priority 10), TXT `send` (SPF). Add TXT `_dmarc` = `v=DMARC1; p=none;` | Route 53 → Hosted zones → prava.ge → Create record (record name without `.prava.ge`, TTL 300) | Records saved |
| 3 | Verify | resend.com → Domains → Verify | Status **Verified** |
| 4 | Production key `prava-production`: Sending access, domain prava.ge | resend.com → API Keys | Key copied once into a password manager |
| 5 | Local check: `EMAIL_FROM=prava.ge <noreply@prava.ge>` locally, forgot password for a local account whose email is **not** your Resend login (e.g. a gtu.ge address) | local | Email arrives (also check spam); proves the domain, not the test sender |
| 6 | ✅ 2026-11-04. Commit both repos on `feat/password-reset-study-day`, merge into `main` (not frontend `dev`: it holds the sitemap timeout that must not reach `main`) | git | `main` builds in both repos |
| 7 | ✅ 2026-11-04 (checked: `\d password_resets`, `users.tokenVersion`). Schema on production. Prod DB is only reachable from Coolify, so paste the SQL below into psql in the Coolify DB terminal (same as `scripts/ensure-password-resets.ts`, safe to re-run) | Coolify → Postgres → Terminal | `\d password_resets` shows the table; `users` has `tokenVersion` |
| 8 | Production env: `RESEND_API_KEY` (prod key), `EMAIL_FROM=prava.ge <noreply@prava.ge>`, `FRONTEND_PUBLIC_URL=https://prava.ge` | Coolify → API app → Environment | Boot log has **no** "Disabled — … Resend" warning |
| 9 | Deploy API, then frontend. The API can go out before step 8 (reset answers 503, nothing else changes) | Coolify / Vercel | Signed-in pages still work |
| 9b | After steps 1–5 and 8: set `PASSWORD_RESET_ENABLED = true` in frontend `src/CONSTS/features.ts`, deploy | prava repo | Login form shows the link; `/auth/forgot-password` page loads |
| 10 | Smoke test (below) | prava.ge | All pass |

Step 7 SQL (one transaction):

```sql
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "tokenVersion" integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS password_resets (
  id serial PRIMARY KEY,
  "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "tokenHash" char(64) NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "usedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_password_resets_token_hash ON password_resets ("tokenHash");
CREATE INDEX IF NOT EXISTS idx_password_resets_user_created ON password_resets ("userId", "createdAt");
COMMIT;
```

Smoke test on production:
- Existing sessions still work after the deploy (old tokens have no `ver` = version 0).
- Forgot password with a real account → email arrives from `noreply@prava.ge`, ka/en/ru link opens the right locale.
- Set new password → lands on `/profile`; another browser that was signed in is now signed out.
- Same link a second time → "invalid, expired or used" message.
- Unknown email → same "check your email" screen, no email.
- Resend → Logs shows `delivered`; API log has no `Resend rejected`.

Rollback: revert the deploy. The new column and table are additive, the old code ignores them.
Order matters: step 7 before step 9, or every signed-in request fails (missing `tokenVersion`).

Later: DMARC from `p=none` to `p=quarantine` after a few weeks of clean Resend reports; watch the free
plan's daily cap in Resend → Usage.
