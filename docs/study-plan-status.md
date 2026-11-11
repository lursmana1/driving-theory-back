# Study plan + learning cards: status and how to resume

Last updated 2026-11-11. Backend side of the study plan. The full picture (product decisions, sign texts, owner
questions) is in the frontend repo: `C:/Users/lursm/Desktop/prava/plans/study-plan-handoff.md` (local, gitignored).

## Branch

`feat/study-plan-preview`. Not merged, not deployed. Local DB only (prava-pg).
Frontend counterpart: `prava` branch `feat/study-plan-mvp`.

## What exists

| Area | Where |
|---|---|
| Schedule + lesson builders, public preview | `src/study-plans/schedule/`, `GET /study-plans/preview`, `GET /study-plans/preview/days/:index` |
| Saved plan (auth) | `study_plans` table, `GET/PUT/DELETE /study-plans/me`, `saved-plans.service.ts`; progress jsonb validated by `progress.util.ts` (`done`, `tests`, `mistakes` per day, capped) |
| Learning cards | `src/learning-cards/` entities: `learning_cards`, `learning_card_texts` (title, body, tutor, audio), `question_cards` (questionId, cardId, primary, source, confirmed) |
| Cards in plan days | `plan-cards.service.ts` + `schedule/plan-subjects.util.ts`: card subjects become lesson units (a card + its tickets, never split; a ticket moves to its primary card's subject; tickets without a card at the subject end). Day session sends `cards` (with `lessonId`); step `cardCount`. Learn days split by estimated time (`splitLessonsByTime`) |
| Schema scripts (idempotent) | `npm run db:ensure-study-plans`, `db:ensure-cards` |
| Data scripts | `db:seed-cards` (262 sign/marking cards from the frontend sign JSON, ka/en/ru; rule cards from frontend `src/data/rules/<subjectId>.json` with their `manual` links, which replace any other link of those tickets), `db:link-sign-cards` (regex links ticket → sign) |
| Card audio | `audio:cards` (`scripts/sync-card-audio.ts`, record locally; ka Gemini TTS Kore Pro or `--flash`, en/ru Chirp3-HD; dry run by default) and `audio:cards:upload` (`scripts/upload-card-audio.ts`, S3 `audio/<lang>/card_<hash>.webm` + `learning_card_texts.tutor/audio`); shared helpers `scripts/lib/card-audio.ts` |

Card texts come from the frontend repo `src/data/signs/tutor/{ka,en,ru}.json` (+ `ka-audio.json` for the shorter
Georgian audio text). Local audio files: `C:/Users/lursm/Desktop/all-audio/<lang>-cards/` with `manifest.json`.

## Status (2026-11-11)

- Local DB: 262 sign cards + 192 rule cards (24 rule subjects, ka only, owner review pending), 758 rule links.
- Audio: en/ru all sign cards; ka 236/239 sign texts (left: marking-1-20, 1-21, 1-23). Rule cards: no audio yet.
  Gemini Tier 1 quota: Flash 100 requests/day, Pro 50/day (reset ~11:00 Tbilisi). Paid: only with the owner's yes.

## Next (backend part)

1. Owner reviews rule cards → en/ru texts → ka audio (paid).
2. Data: `questions.subject` means different topics per category (e.g. subject 24/25 also hold prohibitory-sign
   tickets outside B); 43 B tickets carry another topic's label. Fix before non-B plans.
3. Production rollout, from the owner's PC against the prod DB (never copy the local DB):
   `db:ensure-study-plans` → `db:ensure-cards` → `db:seed-cards` → `db:link-sign-cards` →
   `audio:cards:upload -- --lang=ka,en,ru --run`. Dry run first where the script has one.

## Known, accepted for now

- `PUT /study-plans/me` replaces progress: a client sending no `mistakes` clears them (current clients always send).
- Card audio scripts duplicate `argValue` / ffmpeg / S3 setup from the older audio scripts; move all to `scripts/lib`.
- `CardLessonQueryDto` / `PlanPreviewQueryDto` hardcode category 0–9 and subject 1–99 bounds.
