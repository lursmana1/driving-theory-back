/**
 * Download the Georgian tutor audio that is still wav/mp3 (fresh Gemini output) and convert it
 * to WebM locally, with the same ffmpeg settings as scripts/download-audio-to-webm.ts.
 * Read-only for S3 and the DB: it only writes local files. Upload + repoint + delete the old
 * wav/mp3 afterwards with scripts/migrate-georgian-audio-to-webm.ts --dir=<out>.
 *
 * It downloads exactly the object questions.audio points at, never a stale sibling key.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/convert-ka-audio-to-webm.ts
 *   ... --out=C:\path\to\folder      (default: Desktop\audio-webm-new\ka)
 */
import 'dotenv/config';
import { spawnSync } from 'child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { initPg } from './lib/pg-data-source';

const MIN_WEBM_BYTES = 400;

function resolveFfmpeg(): string {
  if (process.env.FFMPEG_PATH?.trim()) return process.env.FFMPEG_PATH.trim();
  const req = createRequire(__filename);
  return (req('ffmpeg-static') as string | null) ?? 'ffmpeg';
}

/**
 * Older sync-georgian runs uploaded some raw Gemini PCM (s16le, 24 kHz, mono) as `.mp3`: the
 * PCM started with near-silence (FF FF), which the byte sniffer took for an MP3 frame header.
 * A real MP3 starts with an ID3 tag or a frame sync whose second byte is not FF/FE/FD.
 */
function inputFormatArgs(file: string): string[] {
  if (!file.toLowerCase().endsWith('.mp3')) return [];
  const head = readFileSync(file).subarray(0, 3);
  const isId3 = head.toString('latin1') === 'ID3';
  const isFrame =
    head[0] === 0xff && (head[1] & 0xe0) === 0xe0 && head[1] < 0xfd;
  return isId3 || isFrame ? [] : ['-f', 's16le', '-ar', '24000', '-ac', '1'];
}

async function main() {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Missing AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY',
    );
  }
  const bucket = process.env.AWS_S3_BUCKET || 'prava-ge-assets';
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  const outDir = path.resolve(
    outArg
      ? outArg.slice('--out='.length)
      : path.join(os.homedir(), 'Desktop', 'audio-webm-new', 'ka'),
  );
  const srcDir = path.join(outDir, '_source');
  mkdirSync(srcDir, { recursive: true });
  const ffmpeg = resolveFfmpeg();
  const s3 = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  const ds = await initPg();
  let rows: { id: number; key: string }[];
  try {
    rows = (
      await ds.query<{ id: number; key: string }[]>(
        `SELECT id, substring(audio from '(audio/ka/tutor_[0-9]+\\.(?:wav|mp3))$') AS key
         FROM questions
         WHERE lang = 'ka' AND audio ~ '/audio/ka/tutor_[0-9]+\\.(wav|mp3)$'
         ORDER BY id`,
      )
    ).filter((r) => r.key);
  } finally {
    await ds.destroy();
  }
  console.log(`ka rows still wav/mp3: ${rows.length} -> ${outDir}`);

  const failed: string[] = [];
  let ok = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < rows.length) {
        const { id, key } = rows[next++];
        const src = path.join(srcDir, path.basename(key));
        const dest = path.join(outDir, `tutor_${id}.webm`);
        try {
          const res = await s3.send(
            new GetObjectCommand({ Bucket: bucket, Key: key }),
          );
          if (!res.Body) throw new Error('empty S3 body');
          writeFileSync(
            src,
            Buffer.from(await res.Body.transformToByteArray()),
          );
          const r = spawnSync(
            ffmpeg,
            [
              '-hide_banner',
              '-loglevel',
              'error',
              '-y',
              ...inputFormatArgs(src),
              '-i',
              src,
              '-vn',
              '-c:a',
              'libopus',
              '-b:a',
              process.env.AUDIO_WEBM_BITRATE || '48k',
              '-vbr',
              'on',
              '-application',
              'voip',
              dest,
            ],
            { windowsHide: true, encoding: 'utf8' },
          );
          if (r.status !== 0) throw new Error(r.stderr || 'ffmpeg failed');
          if (statSync(dest).size < MIN_WEBM_BYTES)
            throw new Error('webm too small');
          ok++;
        } catch (err) {
          failed.push(`${id}: ${(err as Error).message}`.slice(0, 200));
        }
      }
    }),
  );
  console.log(`converted ${ok}/${rows.length}`);
  if (failed.length) {
    console.error(`FAILED (${failed.length}):\n${failed.join('\n')}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
