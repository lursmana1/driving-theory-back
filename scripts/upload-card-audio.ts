/**
 * Sign card audio, step 2 of 2: upload the recorded files and fill the DB.
 *
 * For every sign in `<dir>/<lang>-cards/manifest.json` (written by
 * `sync-card-audio.ts`) whose file was recorded:
 *   1. uploads `card_<hash>.webm` to S3 `audio/<lang>/card_<hash>.webm`
 *      (skipped when the object is already there with the same size);
 *   2. writes `learning_card_texts.tutor` (from the frontend `tutor/<lang>.json`)
 *      and `.audio` (the public URL) for that sign's card.
 * File names come from the text, so a key never changes content: long cache.
 *
 * Dry run is the default (prints what would change). `--run` uploads and writes.
 *   npm run audio:cards:upload -- --lang=ka            # dry run
 *   npm run audio:cards:upload -- --lang=ka,en,ru --run
 *   ... --dir=C:\Users\me\Desktop\all-audio --signs-dir=../prava/src/data/signs
 *
 * Needs AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (+ optional
 * AWS_S3_BUCKET, AWS_PUBLIC_BASE_URL) and the DB settings in .env.
 */
import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { initPg } from './lib/pg-data-source';
import { signCardId } from '../src/learning-cards/sign-cards.util';
import {
  CARD_AUDIO_LANGS,
  type CardAudioLang,
  cardAudioFile,
  isCardAudioLang,
  readCardAudioTexts,
  readCardTexts,
} from './lib/card-audio';

const DEFAULT_BUCKET = 'prava-ge-assets';
/** Keys are content hashes, so the object behind a key never changes */
const CARD_AUDIO_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const MIN_WEBM_BYTES = 400;

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const RUN = process.argv.includes('--run');
const DIR = path.resolve(
  argValue('dir') ?? path.join(os.homedir(), 'Desktop', 'all-audio'),
);
const SIGNS_DIR = path.resolve(
  argValue('signs-dir') ?? '../prava/src/data/signs',
);

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404;
}

type Row = {
  cardId: string;
  lang: CardAudioLang;
  tutor: string;
  audio: string;
};

async function main() {
  const langArgs = (argValue('lang') ?? '').split(',').filter(Boolean);
  const langs = langArgs.filter(isCardAudioLang);
  if (!langs.length || langs.length !== langArgs.length) {
    console.error(`Pass --lang=${CARD_AUDIO_LANGS.join(',')} (one or more).`);
    process.exit(1);
  }
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Missing AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in .env',
    );
  }
  const bucket = process.env.AWS_S3_BUCKET || DEFAULT_BUCKET;
  const base = (
    process.env.AWS_PUBLIC_BASE_URL ||
    `https://${bucket}.s3.${region}.amazonaws.com`
  ).replace(/\/$/, '');
  const s3 = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  const { signs } = readJson<{
    signs: { slug: string; kind: string; number: string }[];
  }>(path.join(SIGNS_DIR, 'signs.json'));
  const cardBySlug = new Map(
    signs.map((s) => [s.slug, signCardId(s.kind, s.number)]),
  );

  const rows: Row[] = [];
  let uploaded = 0;
  let alreadyOnS3 = 0;
  for (const lang of langs) {
    const folder = path.join(DIR, `${lang}-cards`);
    const manifestFile = path.join(folder, 'manifest.json');
    if (!fs.existsSync(manifestFile)) {
      console.log(`[${lang}] no ${manifestFile}, skipped`);
      continue;
    }
    const manifest = readJson<Record<string, string>>(manifestFile);
    const texts = readCardTexts(SIGNS_DIR, lang);
    const audioTexts = readCardAudioTexts(SIGNS_DIR, lang);
    const files = new Set<string>();
    let notRecorded = 0;
    let stale = 0;
    for (const [slug, file] of Object.entries(manifest)) {
      const local = path.join(folder, file);
      const cardId = cardBySlug.get(slug);
      const tutor = texts[slug];
      if (!fs.existsSync(local) || fs.statSync(local).size < MIN_WEBM_BYTES) {
        notRecorded++;
        continue;
      }
      if (!cardId || !tutor) {
        console.warn(`[${lang}] ${slug}: no card or no text, skipped`);
        continue;
      }
      // The text changed after recording: never pair old audio with new text.
      if (cardAudioFile(audioTexts[slug] ?? '') !== file) {
        stale++;
        continue;
      }
      files.add(file);
      rows.push({
        cardId,
        lang,
        tutor,
        audio: `${base}/audio/${lang}/${file}`,
      });
    }

    for (const file of files) {
      const local = path.join(folder, file);
      const key = `audio/${lang}/${file}`;
      const size = fs.statSync(local).size;
      try {
        const head = await s3.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
        if (head.ContentLength === size) {
          alreadyOnS3++;
          continue;
        }
      } catch (err) {
        if (!isNotFound(err)) throw err;
      }
      if (RUN) {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: fs.readFileSync(local),
            ContentType: 'audio/webm',
            CacheControl: CARD_AUDIO_CACHE_CONTROL,
          }),
        );
      }
      uploaded++;
    }
    console.log(
      `[${lang}] ${files.size} files for ${rows.filter((r) => r.lang === lang).length} signs` +
        (notRecorded ? `, ${notRecorded} signs not recorded yet` : '') +
        (stale ? `, ${stale} signs re-record needed (text changed)` : ''),
    );
  }

  const ds = await initPg();
  try {
    const currentRows: {
      cardId: string;
      lang: string;
      tutor: string | null;
      audio: string | null;
    }[] = await ds.query(
      `SELECT "cardId", lang, tutor, audio FROM learning_card_texts
       WHERE lang = ANY($1::varchar[])`,
      [langs],
    );
    const current = new Map(
      currentRows.map((r) => [`${r.cardId}|${r.lang}`, r]),
    );
    const noRow = rows.filter((r) => !current.has(`${r.cardId}|${r.lang}`));
    const changed = rows.filter((r) => {
      const c = current.get(`${r.cardId}|${r.lang}`);
      return c && (c.tutor !== r.tutor || c.audio !== r.audio);
    });
    if (noRow.length) {
      console.warn(
        `No learning_card_texts row (run db:seed-cards first?): ${noRow
          .map((r) => `${r.cardId}/${r.lang}`)
          .join(', ')}`,
      );
    }
    if (RUN && changed.length) {
      await ds.query(
        `UPDATE learning_card_texts t SET tutor = v.tutor, audio = v.audio
         FROM unnest($1::varchar[], $2::varchar[], $3::text[], $4::varchar[])
           AS v("cardId", lang, tutor, audio)
         WHERE t."cardId" = v."cardId" AND t.lang = v.lang`,
        [
          changed.map((r) => r.cardId),
          changed.map((r) => r.lang),
          changed.map((r) => r.tutor),
          changed.map((r) => r.audio),
        ],
      );
    }
    console.log(
      `S3 ${bucket}: ${RUN ? 'uploaded' : 'to upload'} ${uploaded}, already there ${alreadyOnS3}. ` +
        `DB: ${RUN ? 'updated' : 'to update'} ${changed.length} card texts, ` +
        `${rows.length - changed.length - noRow.length} unchanged.`,
    );
    if (!RUN) console.log('Dry run: nothing uploaded or written. Add --run.');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
