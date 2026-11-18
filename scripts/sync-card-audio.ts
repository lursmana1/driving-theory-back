/**
 * Sign card audio, step 1 of 2: record locally, upload later.
 *
 * Reads the reviewed sign texts from the frontend repo (`src/data/signs/tutor/<lang>.json`,
 * slug → text) and records them in the same voices as the ticket audio, into a local
 * folder as WebM/Opus (the ticket audio format):
 *   ka → Gemini TTS (pro, voice Kore), paid per audio token;
 *   en / ru → Google Cloud TTS Chirp3-HD Aoede (as `sync-audio.ts`), free tier first.
 * Nothing is uploaded and the DB is not touched; the owner listens first.
 *
 * Signs with the same text share one file (`card_<hash>.webm`), so every text is
 * recorded and paid once. Files already in the folder are skipped, so a re-run
 * only pays for new or edited texts. `manifest.json` maps slug → file for the upload.
 *
 * Dry run is the default (count + price, nothing paid). Record only approved groups:
 *   npm run audio:cards -- --groups=1                    # dry run
 *   npm run audio:cards -- --groups=1 --limit=3 --run    # paid: 3 sample texts
 *   npm run audio:cards -- --groups=1,2,3 --run          # paid: those groups
 *   npm run audio:cards -- --lang=en --groups=1 --run    # English (Chirp3-HD)
 *   ... --flash                                          # Flash TTS when Pro hits its daily quota
 *   ... --signs-dir=../prava/src/data/signs --out=D:\clips\ka-cards
 *
 * Groups: 1 warning … 8 additional plates, 9 markings.
 * ka needs GEMINI_API_KEY in .env; en/ru need google-cloud-key.json (or
 * GOOGLE_APPLICATION_CREDENTIALS). ffmpeg comes from ffmpeg-static (or FFMPEG_PATH / PATH).
 */
import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import textToSpeech from '@google-cloud/text-to-speech';
import {
  cardAudioFile,
  isCardAudioLang,
  readCardAudioTexts,
} from './lib/card-audio';

/** `--flash` uses Flash TTS (own daily quota, half the price) when Pro hits its limit */
const FLASH = process.argv.includes('--flash');
const MODEL = FLASH
  ? 'gemini-2.5-flash-preview-tts'
  : 'gemini-2.5-pro-preview-tts';
const VOICE = 'Kore';
const STYLE =
  'Read aloud in Georgian, clear, calm and friendly, like a driving instructor explaining a road sign';
/** TTS USD per 1M tokens (Pro 1/20, Flash 0.5/10); audio is ~25 tokens/s. Georgian ~14 chars/s (estimate). */
const PRICE_IN = FLASH ? 0.5 : 1;
const PRICE_OUT = FLASH ? 10 : 20;
const AUDIO_TOKENS_PER_SEC = 25;
const CHARS_PER_SEC = 14;
/** A clean take is near-silent in its last 0.2 s; louder means Gemini stopped mid-word */
const CUT_DB = -35;
const MAX_TAKES = 3;
const MIN_WEBM_BYTES = 400;
/** Chirp3-HD voices (same as ticket audio); list price USD per 1M chars */
const CHIRP_VOICES = {
  en: { name: 'en-US-Chirp3-HD-Aoede', languageCode: 'en-US' },
  ru: { name: 'ru-RU-Chirp3-HD-Aoede', languageCode: 'ru-RU' },
} as const;
const CHIRP_PRICE_PER_M_CHARS = 30;
/** Gemini and Chirp (LINEAR16 at 24 kHz) give 24 kHz mono 16-bit PCM */
const PCM_BYTES_PER_SEC = 48000;
/** An aborted request is still billed, so keep it long */
const REQUEST_TIMEOUT_MS = 480_000;

function argValue(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const RUN = process.argv.includes('--run');
const LIMIT = Number(argValue('limit') ?? Infinity);
const GROUPS_ARG = argValue('groups');
const LANG_ARG = argValue('lang') ?? 'ka';
if (!isCardAudioLang(LANG_ARG)) {
  console.error(`--lang must be ka, en or ru (got ${LANG_ARG})`);
  process.exit(1);
}
const LANG = LANG_ARG;
const SIGNS_DIR = path.resolve(
  argValue('signs-dir') ?? '../prava/src/data/signs',
);
const OUT = path.resolve(
  argValue('out') ??
    path.join(os.homedir(), 'Desktop', 'all-audio', `${LANG}-cards`),
);

function resolveFfmpeg(): string {
  if (process.env.FFMPEG_PATH?.trim()) return process.env.FFMPEG_PATH.trim();
  try {
    const require = createRequire(__filename);
    const fromStatic = require('ffmpeg-static') as string | null;
    if (fromStatic) return fromStatic;
  } catch {
    /* optional */
  }
  return 'ffmpeg';
}
const FFMPEG = resolveFfmpeg();

function ff(args: string[]): string {
  const r = spawnSync(FFMPEG, args, { encoding: 'utf8', windowsHide: true });
  return (r.stdout || '') + (r.stderr || '');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const groupOf = (slug: string) =>
  slug.startsWith('marking-') ? 9 : Number(slug.split('-')[0]);
const isRecorded = (file: string) => {
  const p = path.join(OUT, file);
  return fs.existsSync(p) && fs.statSync(p).size >= MIN_WEBM_BYTES;
};

type Usage = { sec: number; tokensIn: number; tokensOut: number };

function logUsage(model: string, file: string, parts: string[]) {
  fs.appendFileSync(
    path.join(OUT, 'tts-usage.log'),
    [new Date().toISOString(), model, file, ...parts].join('\t') + '\n',
  );
}

/** Chirp3-HD → raw 24 kHz PCM in `pcm` (WAV header dropped). Returns seconds. */
async function speakChirp(
  tts: InstanceType<typeof textToSpeech.TextToSpeechClient>,
  lang: 'en' | 'ru',
  text: string,
  pcm: string,
): Promise<number> {
  for (let attempt = 0; ; attempt++) {
    try {
      const [res] = await tts.synthesizeSpeech({
        input: { text },
        voice: CHIRP_VOICES[lang],
        audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000 },
      });
      const wav = Buffer.from(res.audioContent as Uint8Array);
      fs.writeFileSync(pcm, wav.subarray(44));
      const sec = +((wav.length - 44) / PCM_BYTES_PER_SEC).toFixed(1);
      logUsage(CHIRP_VOICES[lang].name, path.basename(pcm), [
        `chars=${text.length}`,
        `audio=${sec}s`,
      ]);
      return sec;
    } catch (err) {
      if (attempt < 4) {
        console.log(`  TTS error (${(err as Error).message}), retrying…`);
        await sleep(5000 * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }
}

async function speak(key: string, text: string, pcm: string): Promise<Usage> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': key,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${STYLE}: ${text}` }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } },
              },
            },
          }),
        },
      );
    } catch (err) {
      if (attempt < 5) {
        console.log(`  network error (${(err as Error).message}), retrying…`);
        await sleep(10_000);
        continue;
      }
      throw err;
    }
    // A gateway error page is HTML, not JSON: read text, retry if unparsable.
    const raw = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* handled below */
    }
    if ((parsed == null || res.status >= 500) && attempt < 5) {
      console.log(`  HTTP ${res.status} (unreadable reply), retrying…`);
      await sleep(20_000);
      continue;
    }
    const json = (parsed ?? {}) as {
      error?: unknown;
      candidates?: {
        finishReason?: string;
        content?: { parts?: { inlineData?: { data?: string } }[] };
      }[];
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      };
    };
    if (res.status === 429 && attempt < 5) {
      console.log(`  HTTP ${res.status}, retrying…`);
      await sleep(20_000);
      continue;
    }
    const data = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    // Flash sometimes answers 200 with no audio (finishReason OTHER): ask again
    if (res.ok && !data && attempt < 3) {
      console.log(
        `  no audio (${json.candidates?.[0]?.finishReason ?? '?'}), retrying…`,
      );
      await sleep(5_000);
      continue;
    }
    if (!res.ok || !data) {
      throw new Error(
        `Gemini TTS: HTTP ${res.status} ${JSON.stringify(json.error ?? json).slice(0, 1200)}`,
      );
    }
    fs.writeFileSync(pcm, Buffer.from(data, 'base64'));
    const usage: Usage = {
      sec: +(fs.statSync(pcm).size / PCM_BYTES_PER_SEC).toFixed(1),
      tokensIn: json.usageMetadata?.promptTokenCount ?? 0,
      tokensOut: json.usageMetadata?.candidatesTokenCount ?? 0,
    };
    logUsage(MODEL, path.basename(pcm), [
      `in=${usage.tokensIn}`,
      `out=${usage.tokensOut}`,
      `audio=${usage.sec}s`,
    ]);
    return usage;
  }
}

function tailDb(pcm: string): number {
  const end = Math.max(0, fs.statSync(pcm).size / PCM_BYTES_PER_SEC - 0.2);
  const m = ff([
    '-f',
    's16le',
    '-ar',
    '24000',
    '-ac',
    '1',
    '-ss',
    String(end),
    '-i',
    pcm,
    '-af',
    'volumedetect',
    '-f',
    'null',
    '-',
  ]).match(/max_volume: ([-\d.]+) dB/);
  return m ? Number(m[1]) : -99;
}

/**
 * Encodes to a temp file and renames it when complete, so a run killed
 * mid-encode never leaves a partial `.webm` that later counts as recorded.
 */
function encodeWebm(pcm: string, out: string) {
  const tmp = `${out}.part`;
  ff([
    '-y',
    '-f',
    's16le',
    '-ar',
    '24000',
    '-ac',
    '1',
    '-i',
    pcm,
    '-af',
    'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5',
    '-ar',
    '48000',
    '-c:a',
    'libopus',
    '-b:a',
    '48k',
    '-f',
    'webm',
    tmp,
  ]);
  if (!fs.existsSync(tmp) || fs.statSync(tmp).size < MIN_WEBM_BYTES) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`ffmpeg failed for ${out}`);
  }
  fs.renameSync(tmp, out);
}

async function main() {
  if (!GROUPS_ARG) {
    console.error('Pass --groups=1,2,… (only groups the owner approved).');
    process.exit(1);
  }
  const groups = new Set(GROUPS_ARG.split(',').map(Number));
  const texts = readCardAudioTexts(SIGNS_DIR, LANG);
  const picked = Object.entries(texts).filter(([slug]) =>
    groups.has(groupOf(slug)),
  );

  const manifestFile = path.join(OUT, 'manifest.json');
  const manifest = (
    fs.existsSync(manifestFile)
      ? JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
      : {}
  ) as Record<string, string>;
  const jobs = new Map<string, { text: string; slugs: string[] }>();
  for (const [slug, text] of picked) {
    const file = cardAudioFile(text);
    manifest[slug] = file;
    const job = jobs.get(file) ?? { text, slugs: [] };
    job.slugs.push(slug);
    jobs.set(file, job);
  }
  const missing = [...jobs.entries()].filter(([file]) => !isRecorded(file));
  const todo = missing.slice(0, LIMIT);

  const chars = todo.reduce((n, [, j]) => n + j.text.length, 0);
  const estSec = chars / CHARS_PER_SEC;
  const engine = LANG === 'ka' ? `${MODEL}, ${VOICE}` : CHIRP_VOICES[LANG].name;
  const estUsd =
    LANG === 'ka'
      ? (estSec * AUDIO_TOKENS_PER_SEC * PRICE_OUT + chars * PRICE_IN) / 1e6
      : (chars * CHIRP_PRICE_PER_M_CHARS) / 1e6;
  console.log(
    `Groups ${[...groups].join(',')}: ${picked.length} signs, ${jobs.size} distinct texts, ` +
      `${jobs.size - missing.length} already recorded.`,
  );
  console.log(
    `To record: ${todo.length} texts, ${chars} chars, ~${(estSec / 60).toFixed(0)} min audio, ` +
      `~$${estUsd.toFixed(2)} at list price (${engine}).`,
  );
  console.log(`Output: ${OUT}`);

  if (!RUN) {
    for (const [file, j] of todo.slice(0, 5))
      console.log(`  ${file}  ${j.slugs.join(', ')}`);
    console.log('Dry run: nothing paid. Add --run to record.');
    return;
  }

  fs.mkdirSync(OUT, { recursive: true });
  const key = process.env.GEMINI_API_KEY?.trim() ?? '';
  if (LANG === 'ka' && !key)
    throw new Error('GEMINI_API_KEY is missing in .env');
  const tts =
    LANG === 'ka'
      ? null
      : new textToSpeech.TextToSpeechClient({
          keyFilename: path.resolve(
            process.env.GOOGLE_APPLICATION_CREDENTIALS ??
              'google-cloud-key.json',
          ),
          apiEndpoint: 'texttospeech.googleapis.com',
        });

  const total: Usage = { sec: 0, tokensIn: 0, tokensOut: 0 };
  let done = 0;
  for (const [file, job] of todo) {
    const pcm = path.join(OUT, file.replace('.webm', '.pcm'));
    if (tts) {
      total.sec += await speakChirp(tts, LANG as 'en' | 'ru', job.text, pcm);
    }
    for (let take = 1; !tts; take++) {
      const u = await speak(key, job.text, pcm);
      total.sec += u.sec;
      total.tokensIn += u.tokensIn;
      total.tokensOut += u.tokensOut;
      const db = tailDb(pcm);
      if (db <= CUT_DB) break;
      if (take === MAX_TAKES) {
        console.warn(
          `  WARNING ${file}: still ends abruptly (${db} dB), listen to it`,
        );
        break;
      }
      console.log(`  ${file}: cut off (${db} dB), new take…`);
    }
    encodeWebm(pcm, path.join(OUT, file));
    fs.rmSync(pcm);
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
    console.log(`[${++done}/${todo.length}] ${file}  ${job.slugs.join(', ')}`);
  }
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  const usd = tts
    ? (chars * CHIRP_PRICE_PER_M_CHARS) / 1e6
    : (total.tokensOut * PRICE_OUT + total.tokensIn * PRICE_IN) / 1e6;
  console.log(
    `Done: ${done} texts, ${(total.sec / 60).toFixed(1)} min audio, ` +
      (tts
        ? `${chars} chars`
        : `in=${total.tokensIn} out=${total.tokensOut} tokens`) +
      ` ≈ $${usd.toFixed(2)} at list price.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
