-- study_plans.revision (2026-11): every save bumps it; a client that sends the revision it read only
-- overwrites that version, otherwise the API answers 409. Existing rows start at 1.
-- Same as `npm run db:ensure-study-plans -- --print-sql`. Idempotent; run before deploying the API
-- that returns `revision` from GET /study-plans/me.

ALTER TABLE study_plans
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
