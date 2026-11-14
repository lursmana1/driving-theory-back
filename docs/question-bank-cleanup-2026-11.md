# Question bank cleanup (2026-11)

## What was wrong

Source of truth for the ticket list: starti.ge theory tickets
(`https://www.starti.ge/martvis-mocmobis-biletebi-teoria.php?category=<X>&lang=<ka|ru|en>`), all 10
categories crawled 2026-11-12, 1582 distinct ids. Category mapping (by id overlap): AM=0, B=1, A=2, C=3,
D=4, C1=5, D1=6, **T=7** (our "Military"), Tram=8, **Mil=9** (our "T/S", the shared pool).

1. **The 2026-08 prune used the wrong list.** `legit-question-ids.json` (1259 ids) was exactly starti's
   `Mil` list, the pool shared by every category. It removed all category-specific questions: 346 that
   are still current (T 197, A 63, D1 54, D 52, AM 36, Tram 13) along with 206 really outdated ones.
2. **23 live questions** are on no starti list any more (outdated).
3. **ru/en drift from ka** (ka is the source of truth, and matches starti for every live question):
   - 166 ru/en rows (83 questions) had `correct_answer` pointing at the wrong answer.
   - 352 ru/en rows had invented extra answers ("None of the above", "No correct answer", ...) beyond
     ka's 2-3 answers.
   Every case that could be checked by text against starti's ru/en confirmed the ka index.
4. **3 live images missing** in the frontend (`ticketIMG-85/90/259.jpg`).

## What ships

| File | What it does |
|------|--------------|
| `scripts/sql/01-ensure-questions-archived.sql` | creates empty `questions_archived` (needed by the new exam code) |
| `scripts/sql/02-archive-outdated-questions-2026-11.sql` | moves the 23 outdated ids to `questions_archived` |
| `scripts/sql/03-align-ru-en-with-ka-2026-11.sql` | ru/en `correct_answer` + categories from ka, drops invented extra answers (generic, idempotent) |
| `scripts/sql/04-restore-category-questions-2026-11.sql` | restores 343 category questions x 3 langs, already normalised and verified against starti |
| `scripts/sql/05-restore-audio-2026-11.sql` | audio URLs for the 343 (generated after TTS, see below) |
| backend code | past attempts load archived questions (`archived: true`), mid-exam answers graded from the archive, `/categories` counts from live questions |
| frontend `public/ticket_media/new/` | 11 images: 8 for restored questions + 3 missing live ones |
| `npm run db:check-question-bank` | read-only guard; exits 1 if ru/en drift from ka, answers are invented or missing, text/image is missing |

Held back: **1793, 1794, 1795** (AM moped questions). Their images exist nowhere (starti's are broken too).
Restore them once the images are found.

Result on the local copy: every category equals starti (AM 310 vs 313 = the 3 held back), 1579 questions
in each language, `db:check-question-bank` clean except audio.

## Rollout

Local (done 2026-11-12 except audio): 02, 03, 04 applied; images copied into the frontend repo.

1. **Audio, local (paid TTS, operator runs):**
   - `npm run sync:georgian`: ka audio. Reuses existing S3 audio for the 1236, so only the 343 new ones are generated.
   - `npm run sync:audio`: ru/en (~163k characters for the 343).
   - `npm run db:check-question-bank -- --public-dir=../prava/public` → no FAIL, no audio warnings.
   - Generate step 5 SQL (audio URLs only, idempotent):
     ```bash
     docker exec prava-pg psql -U postgres -d prava -At -c "SELECT format('UPDATE questions SET audio = %L WHERE id = %s AND lang = %L AND NULLIF(TRIM(audio), '''') IS NULL;', audio, id, lang) FROM questions WHERE id = ANY(ARRAY[<restore ids>]) AND NULLIF(TRIM(audio), '') IS NOT NULL ORDER BY id, lang" > scripts/sql/05-restore-audio-2026-11.sql
     ```
2. **Frontend:** commit + deploy the 11 images (before step 7, or restored image questions show broken images).
3. **Prod DB backup:** Coolify → PostgreSQL → Backups → Backup Now.
4. **01** in the Coolify Postgres terminal (last line `t`). The repo is public, so files can be piped from GitHub:
   ```bash
   wget -qO- https://raw.githubusercontent.com/lursmana1/nest/main/scripts/sql/01-ensure-questions-archived.sql | psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1
   ```
   (01 must run before step 5's deploy, so paste it by hand if `main` does not have the file yet.)
5. **Deploy backend `main`.** Boot log must not contain `questions_archived is missing`.
6. **02, 03** (same `wget … | psql` line, change the file name). 02: `still_live` 0. 03: last line `0|0|0`.
7. **04, 05.** 04: 343 per lang. 05: one UPDATE per row.
8. Check prava.ge: `/categories` counts, a T and a D exam in ru, an old exam result.

## Re-running the comparison later

The crawler and diff were one-off tools (not in the repo). What matters is in `npm run db:check-question-bank`
plus a per-category count against starti. Ask to turn the crawler into a `scripts/` command if this becomes recurring.
