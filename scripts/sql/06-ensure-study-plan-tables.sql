-- Study plan tables: study_plans (one saved plan per user) and the lesson-card tables
-- learning_cards, learning_card_texts, question_cards. Printed by scripts/ensure-study-plans.ts
-- and scripts/ensure-cards.ts (--print-sql). Idempotent (IF NOT EXISTS); run before deploying the
-- API that serves /study-plans, then load the data with 07-study-plan-cards-2026-11.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS study_plans (
    "userId" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "categoryId" smallint NOT NULL,
    "dayCount" smallint NOT NULL,
    "startDay" date NOT NULL,
    "examDay" date NULL,
    progress jsonb NOT NULL DEFAULT '{"done":{},"tests":{}}',
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_study_plans PRIMARY KEY ("userId")
  );

CREATE TABLE IF NOT EXISTS learning_cards (
    id varchar(64) NOT NULL,
    kind varchar(10) NOT NULL,
    "subjectId" smallint NOT NULL,
    "order" integer NOT NULL,
    image varchar(256) NULL,
    "signNumber" varchar(16) NULL,
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_learning_cards PRIMARY KEY (id)
  );

CREATE INDEX IF NOT EXISTS idx_learning_cards_subject
    ON learning_cards ("subjectId", "order");

CREATE TABLE IF NOT EXISTS learning_card_texts (
    "cardId" varchar(64) NOT NULL REFERENCES learning_cards(id) ON DELETE CASCADE,
    lang varchar(5) NOT NULL,
    title text NOT NULL,
    body text NULL,
    tutor text NULL,
    audio varchar(512) NULL,
    CONSTRAINT pk_learning_card_texts PRIMARY KEY ("cardId", lang)
  );

CREATE TABLE IF NOT EXISTS question_cards (
    "questionId" integer NOT NULL,
    "cardId" varchar(64) NOT NULL REFERENCES learning_cards(id) ON DELETE CASCADE,
    "primary" boolean NOT NULL DEFAULT false,
    source varchar(10) NOT NULL,
    confirmed boolean NOT NULL DEFAULT false,
    CONSTRAINT pk_question_cards PRIMARY KEY ("questionId", "cardId")
  );

CREATE INDEX IF NOT EXISTS idx_question_cards_card
    ON question_cards ("cardId");

CREATE UNIQUE INDEX IF NOT EXISTS uq_question_cards_primary
    ON question_cards ("questionId") WHERE "primary";

COMMIT;
