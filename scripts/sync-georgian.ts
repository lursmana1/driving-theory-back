import 'dotenv/config';
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { initPg } from './lib/pg-data-source';

// ---------------------------------------------------------------------------
// Config (override: GEMINI_TTS_MODEL)
// ---------------------------------------------------------------------------

/** TTS preview — ხშირად აბრუნებს PCM (audio/L16), არა MP3. ცარიელი ფაილები იყო როცა base64/PCM არ იშლებოდა სწორად; ახლა extract + pcm16MonoToWav → სათამაშო WAV. */
const MODEL_NAME = 'gemini-2.5-flash-preview-tts';
const VOICE_NAME = 'Zephyr';

function envMs(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** წარმატებული გენერაციის შემდეგ პაუზა (უფასო RPM — ნელა) */
const REQUEST_DELAY_MS = envMs('GEORGIAN_REQUEST_DELAY_MS', 120_000);
/** პირველი 429-ის შემდეგ ლოდინი; შემდეგ იზრდება ექსპონენციალურად */
const RATE_LIMIT_BASE_MS = envMs('GEORGIAN_429_BASE_MS', 300_000);
const RATE_LIMIT_MAX_MS = envMs('GEORGIAN_429_MAX_MS', 1_800_000);
/** ამდენი ზედიზედ 429-ის შემდეგ გაჩერება (0 = გამორთული) */
const MAX_429_STREAK = envMs('GEORGIAN_MAX_429_STREAK', 12);
const DEFAULT_BUCKET = 'prava-ge-assets';
const MIN_S3_BYTES = 1000;
const MIN_DECODED_AUDIO_BYTES = 800;
const MAX_AUDIO_GENERATION_ATTEMPTS = 4;
const DEBUG = process.env.GEORGIAN_SYNC_DEBUG === '1';

type QuestionKaDoc = {
  id: number;
  lang: 'ka';
  ai_tutor: string | null;
  audio: string | null;
};

type ExtractedTtsAudio = {
  buffer: Buffer;
  contentType: string;
  fileExtension: 'mp3' | 'wav';
};

// ---------------------------------------------------------------------------
// Georgian text for TTS (digits → words)
// ---------------------------------------------------------------------------

function prepareGeorgianText(text: string): string {
  const numMap: Record<string, string> = {
    '1': 'ერთი',
    '2': 'ორი',
    '3': 'სამი',
    '4': 'ოთხი',
    '5': 'ხუთი',
    '6': 'ექვსი',
    '7': 'შვიდი',
    '8': 'რვა',
    '9': 'ცხრა',
    '10': 'ათი',
    '11': 'თერთმეტი',
    '12': 'თორმეტი',
    '13': 'ცამეტი',
    '14': 'თოთხმეტი',
    '15': 'თხუთმეტი',
    '16': 'თექვსმეტი',
    '17': 'ჩვიდმეტი',
    '18': 'თვრამეტი',
    '19': 'ცხრამეტი',
    '20': 'ოცი',
  };
  return text
    .replace(/\b(\d+)\b/g, (m) => numMap[m] || m)
    .replace(/\//g, ' პროცენტი ')
    .trim();
}

// ---------------------------------------------------------------------------
// Gemini inline audio → Buffer (MP3 / WAV / PCM→WAV)
// ---------------------------------------------------------------------------

function inlineDataToBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (typeof data !== 'string') {
    throw new Error(`inlineData.data: unsupported type ${typeof data}`);
  }
  let b64 = data.trim();
  if (b64.startsWith('data:')) {
    const i = b64.indexOf(',');
    if (i === -1) throw new Error('data URL: missing comma');
    b64 = b64.slice(i + 1);
  }
  b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad) b64 += '='.repeat(4 - pad);
  return Buffer.from(b64, 'base64');
}

function isMpegMime(mime: string): boolean {
  const m = mime.toLowerCase();
  return m.includes('mpeg') || m.includes('mp3') || m === 'audio/mp4' || m.includes('mp4a');
}

function looksLikeMp3(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true;
  return buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
}

function looksLikeWav(buf: Buffer): boolean {
  return buf.length >= 12 && buf.slice(0, 4).toString() === 'RIFF';
}

function pcmRateFromMime(mime: string): number | null {
  const m = /rate=(\d+)/i.exec(mime);
  return m ? parseInt(m[1], 10) : null;
}

function isPcmL16Mime(mime: string): boolean {
  const m = mime.toLowerCase();
  return m.includes('l16') || (m.includes('pcm') && m.startsWith('audio/'));
}

/** PCM16 LE mono → RIFF WAV (ბრაუზერი იკითხავს; არ ატვირთო raw PCM როგორც audio/mpeg) */
function pcm16MonoToWav(pcm: Buffer, sampleRate: number): Buffer {
  const nCh = 1;
  const bits = 16;
  const byteRate = sampleRate * nCh * (bits / 8);
  const align = nCh * (bits / 8);
  const n = pcm.length;
  const out = Buffer.alloc(44 + n);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + n, 4);
  out.write('WAVE', 8);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(nCh, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(byteRate, 28);
  out.writeUInt16LE(align, 32);
  out.writeUInt16LE(bits, 34);
  out.write('data', 36);
  out.writeUInt32LE(n, 40);
  pcm.copy(out, 44);
  return out;
}

function extractAudioFromTtsResponse(result: unknown): ExtractedTtsAudio {
  type Part = { inlineData?: { data?: string; mimeType?: string } };
  const res = result as {
    response?: {
      candidates?: Array<{ content?: { parts?: Part[] }; finishReason?: string }>;
      promptFeedback?: { blockReason?: string };
    };
  };

  const block = res.response?.promptFeedback?.blockReason;
  if (block) throw new Error(`Prompt blocked: ${block}`);

  const candidates = res.response?.candidates ?? [];
  const errs: string[] = [];

  for (let ci = 0; ci < candidates.length; ci++) {
    const c = candidates[ci];
    const fr = c?.finishReason;
    if (fr && fr !== 'STOP' && fr !== 'MAX_TOKENS') {
      errs.push(`c[${ci}] finish=${fr}`);
    }
    const parts = c?.content?.parts ?? [];
    for (let pi = 0; pi < parts.length; pi++) {
      const id = parts[pi]?.inlineData;
      if (!id?.data) continue;

      const mimeType = (id.mimeType || 'audio/mpeg').trim();
      let buf: Buffer;
      try {
        buf = inlineDataToBuffer(id.data);
      } catch (e) {
        errs.push(`c[${ci}]p[${pi}] ${(e as Error).message}`);
        continue;
      }
      if (buf.length < MIN_DECODED_AUDIO_BYTES) {
        errs.push(`c[${ci}]p[${pi}] small:${buf.length}b`);
        continue;
      }

      const ml = mimeType.toLowerCase();
      if (isMpegMime(mimeType) || looksLikeMp3(buf)) {
        return { buffer: buf, contentType: 'audio/mpeg', fileExtension: 'mp3' };
      }
      if (looksLikeWav(buf) || ml.includes('wav')) {
        return { buffer: buf, contentType: 'audio/wav', fileExtension: 'wav' };
      }
      if (isPcmL16Mime(mimeType)) {
        const hz = pcmRateFromMime(mimeType) ?? 24_000;
        const wav = pcm16MonoToWav(buf, hz);
        console.warn(`PCM ${mimeType} → WAV @ ${hz}Hz (${wav.length}b)`);
        return { buffer: wav, contentType: 'audio/wav', fileExtension: 'wav' };
      }
      errs.push(`c[${ci}]p[${pi}] mime:${mimeType}`);
    }
  }

  throw new Error(`No usable audio. ${errs.join('; ') || 'no inlineData'}`);
}

// ---------------------------------------------------------------------------
// Small utils
// ---------------------------------------------------------------------------

function getPublicUrl(bucket: string, region: string, key: string): string {
  const base =
    process.env.AWS_PUBLIC_BASE_URL ||
    `https://${bucket}.s3.${region}.amazonaws.com`;
  return `${base.replace(/\/$/, '')}/${key}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isNotFoundError(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e?.name === 'NotFound' ||
    e?.name === 'NoSuchKey' ||
    e?.$metadata?.httpStatusCode === 404
  );
}

function isRateLimitError(err: unknown): boolean {
  const e = err as { status?: number };
  const msg = ((err as Error)?.message ?? '').toLowerCase();
  return e?.status === 429 || msg.includes('429') || msg.includes('rate limit');
}

function parseSyncLimit(): number {
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--limit=')) {
      const n = Number.parseInt(a.slice(8), 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  const raw = (process.env.GEORGIAN_SYNC_LIMIT ?? process.env.SYNC_LIMIT ?? '').trim();
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

async function findReusableS3AudioUrl(
  s3: S3Client,
  bucket: string,
  region: string,
  baseKey: string,
): Promise<string | null> {
  for (const ext of ['mp3', 'wav'] as const) {
    const key = `${baseKey}.${ext}`;
    try {
      const head = await s3.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      if ((head.ContentLength ?? 0) >= MIN_S3_BYTES) {
        return getPublicUrl(bucket, region, key);
      }
    } catch (e) {
      if (!isNotFoundError(e)) throw e;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  const region = process.env.AWS_REGION || 'eu-central-1';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.AWS_S3_BUCKET || DEFAULT_BUCKET;

  if (!apiKey || !region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Missing env: GEMINI_API_KEY, AWS_REGION, AWS keys (PG_* for database)',
    );
  }

  const activeModel = process.env.GEMINI_TTS_MODEL?.trim() || MODEL_NAME;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: activeModel });
  const ds = await initPg();
  const s3 = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  const limit = parseSyncLimit();
  const rows = (await ds.query(
    `SELECT id, lang, ai_tutor, audio
     FROM questions
     WHERE lang = 'ka'
       AND ai_tutor IS NOT NULL
       AND TRIM(ai_tutor) <> ''
     ORDER BY id ASC
     ${limit > 0 ? 'LIMIT $1' : ''}`,
    limit > 0 ? [limit] : [],
  )) as QuestionKaDoc[];

  console.log(`Georgian TTS | model=${activeModel} | voice=${VOICE_NAME}`);
  console.log(
    `Delays: ok→next=${REQUEST_DELAY_MS / 1000}s | 429 base=${RATE_LIMIT_BASE_MS / 1000}s max=${RATE_LIMIT_MAX_MS / 1000}s | streak stop=${MAX_429_STREAK || 'off'}`,
  );
  if (limit > 0) console.log(`Limit ${limit} doc(s) (--limit / GEORGIAN_SYNC_LIMIT)`);

  let processed = 0;
  let consecutive429 = 0;

  docLoop: for (const doc of rows) {
    const raw = (doc.ai_tutor ?? '').trim();
    if (!raw) continue;

    const text = prepareGeorgianText(raw);
    const baseKey = `audio/ka/tutor_${doc.id}`;

    const reuse = await findReusableS3AudioUrl(s3, bucket, region, baseKey);
    if (reuse) {
      console.log(`[${doc.id}] skip (S3 ok)`);
      await ds.query(
        `UPDATE questions SET audio = $1 WHERE id = $2 AND lang = 'ka'`,
        [reuse, doc.id],
      );
      continue;
    }

    let done = false;
    let attempt = 0;

    while (!done && attempt < MAX_AUDIO_GENERATION_ATTEMPTS) {
      attempt++;
      try {
        if (DEBUG) {
          console.log(
            `[${doc.id}] gen ${attempt}/${MAX_AUDIO_GENERATION_ATTEMPTS}`,
          );
        } else {
          console.log(`[${doc.id}] generating… (${attempt}/${MAX_AUDIO_GENERATION_ATTEMPTS})`);
        }

        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['audio'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: VOICE_NAME },
              },
            },
          },
        } as any);
        consecutive429 = 0;

        const cand = result.response?.candidates?.[0];
        if (DEBUG && cand) {
          console.log(`  candidates=${result.response?.candidates?.length} finish=${cand.finishReason}`);
        }

        if (cand?.finishReason === 'SAFETY' || cand?.finishReason === 'OTHER') {
          console.warn(`[${doc.id}] blocked (${cand.finishReason})`);
          done = true;
          continue docLoop;
        }

        const extracted = extractAudioFromTtsResponse(result);
        const key = `${baseKey}.${extracted.fileExtension}`;
        const url = getPublicUrl(bucket, region, key);

        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: extracted.buffer,
            ContentType: extracted.contentType,
          }),
        );
        await ds.query(
          `UPDATE questions SET audio = $1 WHERE id = $2 AND lang = 'ka'`,
          [url, doc.id],
        );

        console.log(
          `[${doc.id}] ok ${extracted.fileExtension} ${extracted.buffer.length}b → ${key}`,
        );
        processed++;
        done = true;
        await sleep(REQUEST_DELAY_MS);
      } catch (err) {
        if (isRateLimitError(err)) {
          consecutive429++;
          if (MAX_429_STREAK > 0 && consecutive429 >= MAX_429_STREAK) {
            console.error(
              `Stopping: ${consecutive429} consecutive 429 responses. Free-tier quota is tight or daily limit hit — try again later/tomorrow, or raise GEORGIAN_REQUEST_DELAY_MS (e.g. 300000) and GEORGIAN_429_BASE_MS.`,
            );
            process.exit(0);
          }
          const exp = Math.min(consecutive429 - 1, 8);
          const backoffMs = Math.min(
            RATE_LIMIT_BASE_MS * 2 ** exp,
            RATE_LIMIT_MAX_MS,
          );
          console.warn(
            `[${doc.id}] 429 (#${consecutive429}${MAX_429_STREAK ? `/${MAX_429_STREAK}` : ''}) → sleep ${Math.round(backoffMs / 1000)}s`,
          );
          await sleep(backoffMs);
          attempt--;
        } else {
          console.error(`[${doc.id}]`, err);
          if (attempt >= MAX_AUDIO_GENERATION_ATTEMPTS) done = true;
          else await sleep(5000);
        }
      }
    }
  }

  await ds.destroy();
  console.log(`Done. uploaded/regenerated: ${processed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
