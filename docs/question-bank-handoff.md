# Question bank fix: where we are and what is next

Last updated: 2026-11-14. Branch: `feat/archive-outdated-questions`, committed and merged into local `main` (not pushed).
Background and the full rollout: `docs/question-bank-cleanup-2026-11.md`.

Scope is **only** questions, categories, images and audio. No other tables or features in this branch
(`01` creates `questions_archived` and nothing else).

## Status

| Part | State |
|---|---|
| Backend code (past exam review, mid-exam answers from archive, live category counts) | done, tests pass, browser-tested locally |
| SQL `01`, `02`, `03`, `04` in `scripts/sql/` | written, tested twice on a prod copy, applied to local DB |
| 343 restored questions (ka/ru/en text, answers, explanations, `ai_tutor`, categories) | done, match starti.ge |
| Images: 11 files in frontend `prava/public/ticket_media/new/` | added, **not committed** in the frontend repo |
| ru + en audio (686 mp3, no greeting) | **done** |
| ka audio | **done** (343 / 343, generated 2026-11-12 to 2026-11-14) |
| ka wav/mp3 → webm (like the other 1236) | **done**: 343 uploaded, DB repointed, 346 old wav/mp3 deleted. Local DB: ka webm 1579, ru/en mp3 1579 |
| `05-restore-audio-2026-11.sql` | **generated** (1029 UPDATEs), re-run on the local DB: `UPDATE 0` × 1029, `still_missing` 0 |
| `db:check-question-bank` | every line `[ok]`, including rows without audio 0 |
| Commit / merge | backend committed on the branch and merged into local `main`; **not pushed** |
| Prod | not started: needs the frontend images deployed first, then step 6 |

Local DB category counts: AM 310, B 898, A 738, C 905, D 808, C1 915, D1 822, T 884, Tram 859, T/S 1236.
Held back on purpose: questions 1793, 1794, 1795 (no image anywhere).

## Next steps, in order

Steps 1–4 were completed on 2026-11-14 and are kept below for reruns (e.g. future restored questions).
**What is left: step 5 frontend part, then step 6.** Not verified by hand yet: listening to the restored
questions in the browser (step 3, last paragraph).

All commands run from the backend folder in PowerShell. They write to the **local** DB and the real
S3 bucket (`.env`); prod is only touched in step 7.

### 1. Finish the 81 Georgian audio (paid, Gemini)

```powershell
$env:GEORGIAN_SWITCH_AFTER_429 = '0'   # stay on Flash, never fall back to Pro
npx ts-node -r tsconfig-paths/register scripts/sync-georgian.ts --missing-audio --force
```
- Call ts-node directly: in PowerShell `npm run sync:georgian -- --missing-audio --force` drops both flags
  (npm prints `Unknown cli config "--missing-audio"`), and the script then walks all 1579 rows and relinks
  rows to old pre-August `.wav` files. Stop it at once if the log says `Queue size: 1579`.
- `--missing-audio`: only questions without audio (the 81). `--force`: never reuse old pre-August S3 files.
- Greeting "გამარჯობა" is stripped before speaking (built in).
- If it keeps printing `429`, the daily quota is used up: stop it (Ctrl+C) and run again the next day. Finished ones are saved.
- Check: `docker exec prava-pg psql -U postgres -d prava -At -c "SELECT COUNT(*) FROM questions WHERE lang='ka' AND NULLIF(TRIM(audio),'') IS NULL"` → `0`.

### 2. Convert Georgian to webm

```powershell
npx ts-node -r tsconfig-paths/register scripts/convert-ka-audio-to-webm.ts
```
Local only (writes `Desktop\audio-webm-new\ka`). Expect `converted 343/343`
(all restored ids; the other 1236 are already webm). It also repairs 12 files that an old bug saved as unplayable
headerless `.mp3`.

Then upload: dry run first, then for real (call ts-node directly; npm swallows `--confirm`):
```powershell
npx ts-node -r tsconfig-paths/register scripts/migrate-georgian-audio-to-webm.ts --dir="$HOME\Desktop\audio-webm-new\ka"
npx ts-node -r tsconfig-paths/register scripts/migrate-georgian-audio-to-webm.ts --dir="$HOME\Desktop\audio-webm-new\ka" --confirm
```
It uploads the webm, repoints the DB, then deletes the old wav/mp3 for those ids only.

### 3. Final check

```powershell
npx ts-node -r tsconfig-paths/register scripts/check-question-bank.ts --public-dir=../prava/public
```
Expect every line `[ok]`, including **rows without audio: 0**. Audio formats should be ka webm, ru/en mp3:
```powershell
docker exec prava-pg psql -U postgres -d prava -At -c "SELECT lang, substring(audio from '\.([a-z0-9]+)$'), COUNT(*) FROM questions GROUP BY 1,2 ORDER BY 1,2"
```
Expect `en|mp3|1579`, `ka|webm|1579`, `ru|mp3|1579`. Then listen to a few restored questions on
localhost:3001 (e.g. 3, 705, 1553) in ka/ru/en: no greeting, voice matches the text.

### 4. Generate `05-restore-audio-2026-11.sql` (audio links for prod)

The restored ids are in the last `SELECT` of `04`. One idempotent UPDATE per row, only fills empty audio
(Git Bash):
```bash
IDS=$(grep -oE "ARRAY\[[0-9,]+\]" scripts/sql/04-restore-category-questions-2026-11.sql | tail -1)
{ echo "BEGIN;"; docker exec prava-pg psql -U postgres -d prava -At -c "SELECT format('UPDATE questions SET audio = %L WHERE id = %s AND lang = %L AND NULLIF(TRIM(audio), '''') IS NULL;', audio, id, lang) FROM questions WHERE id = ANY($IDS::int[]) AND NULLIF(TRIM(audio), '') IS NOT NULL ORDER BY id, lang"; echo "SELECT lang, COUNT(*) FILTER (WHERE NULLIF(TRIM(audio),'') IS NULL) AS still_missing FROM questions WHERE id = ANY($IDS::int[]) GROUP BY lang;"; echo "COMMIT;"; } > scripts/sql/05-restore-audio-2026-11.sql
```
Expect 1029 UPDATE lines (343 × 3).

### 5. Commit and merge

- Backend: **done 2026-11-14** (tsc, eslint on `src/`, 42 jest suites green; committed and merged into local `main`). **Don't push `main`
  until step 7.1–7.2 is done**: the new code needs `questions_archived`.
- Frontend (`prava`): commit the 11 images in `public/ticket_media/new/` and deploy. They must be live before `04` runs on prod.

### 6. Prod order (Coolify Postgres terminal)

Pipe each file from GitHub once it is on `main` (or paste it):
```bash
wget -qO- https://raw.githubusercontent.com/lursmana1/nest/main/scripts/sql/<FILE> | psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1
```
1. Backup: Coolify → PostgreSQL → Backups → Backup Now.
2. `01-ensure-questions-archived.sql` → last line `t`.
3. Deploy frontend (images), then backend `main`. Boot log must not say `questions_archived is missing`.
4. `02-archive-outdated-questions-2026-11.sql` → `still_live` 0.
5. `03-align-ru-en-with-ka-2026-11.sql` → last line `0|0|0`.
6. `04-restore-category-questions-2026-11.sql` → 343 per language.
7. `05-restore-audio-2026-11.sql` → `still_missing` 0 per language.
8. Check prava.ge: `/categories` counts as above, a T and a D exam in ru, an old exam result, audio plays.

## Script changes made in this work (part of the branch)

| File | Change |
|---|---|
| `scripts/sync-audio.ts` | `--ids`/`--ids-file`, `--force` (no reuse of old S3 files), strips "Hello!/Hi there!/Привет!" before speaking (screen text unchanged) |
| `scripts/sync-georgian.ts` | `--ids`/`--ids-file`, `--missing-audio`; fix: Gemini PCM starting with silence was saved as a broken `.mp3`, now always wav |
| `scripts/lib/tutor-audio-args.ts` | shared id parsing + greeting strip |
| `scripts/convert-ka-audio-to-webm.ts` | new: wav/mp3 → webm for ka rows still on wav/mp3 (local files only) |
| `scripts/check-question-bank.ts` | new read-only guard (`npm run db:check-question-bank`) |

## Not in this branch (later)

- Category 7 is labelled "Military" but holds T (tractor) questions.
- Frontend dev mode can start two exams at once.
- 1793–1795: restore when images are found.
- Next project after this ships: study plan.
