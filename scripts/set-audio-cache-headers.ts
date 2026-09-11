/**
 * Add Cache-Control to audio objects already in S3 (no TTS, no DB writes).
 *
 * The sync scripts only started sending CacheControl recently, so every clip
 * uploaded before that is served with no freshness directive and gets
 * re-fetched / revalidated on each page load. This rewrites the header in
 * place via CopyObject (same key, MetadataDirective=REPLACE).
 *
 * Defaults to en,ru only — Georgian is handled separately.
 *
 * npm swallows `--confirm` as its own config flag, so call ts-node directly for
 * anything but the dry run.
 *
 * Usage:
 *   npm run sync:audio:cache-headers               # dry run
 *   npx ts-node -r tsconfig-paths/register scripts/set-audio-cache-headers.ts --confirm
 *   ... --confirm --lang=ru
 */
import 'dotenv/config';
import {
  CopyObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

type Lang = 'ka' | 'en' | 'ru';

/** Keys are stable and overwritten on re-sync, so this is not `immutable` */
const AUDIO_CACHE_CONTROL = 'public, max-age=2592000';
const MIN_S3_BYTES = Number(process.env.AUDIO_MIN_S3_BYTES ?? 1000);

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length || 1)) },
    async () => {
      while (next < items.length) await fn(items[next++]);
    },
  );
  await Promise.all(workers);
}

function parseLangs(): Lang[] {
  const arg = process.argv.find((a) => a.startsWith('--lang='));
  const raw = (arg?.slice(7) || 'en,ru')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const allowed: Lang[] = ['en', 'ru', 'ka'];
  const langs = raw.filter((l): l is Lang => allowed.includes(l as Lang));
  if (!langs.length) throw new Error(`--lang must be one of ${allowed.join(',')}`);
  return langs;
}

function contentTypeFor(key: string): string {
  const k = key.toLowerCase();
  if (k.endsWith('.wav')) return 'audio/wav';
  if (k.endsWith('.webm')) return 'audio/webm';
  return 'audio/mpeg';
}

async function listTutorKeys(
  s3: S3Client,
  bucket: string,
  lang: Lang,
): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;

  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: `audio/${lang}/`,
        ContinuationToken: token,
      }),
    );
    for (const obj of page.Contents ?? []) {
      const key = obj.Key;
      if (!key || (obj.Size ?? 0) < MIN_S3_BYTES) continue;
      if (!/tutor_\d+\.(wav|mp3|webm)$/i.test(key)) continue;
      keys.push(key);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  return keys;
}

async function main() {
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET || 'prava-ge-assets';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Missing AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in .env',
    );
  }

  const langs = parseLangs();
  const confirm = process.argv.includes('--confirm');
  const concurrency = Number.parseInt(argValue('concurrency') || '12', 10);
  const s3 = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  console.log(`Bucket s3://${bucket} | region=${region}`);
  console.log(`Langs: ${langs.join(', ')} | target: ${AUDIO_CACHE_CONTROL}`);
  console.log(`Concurrency: ${concurrency}`);
  if (!confirm) console.log('DRY RUN — pass --confirm to write.');

  const summary: Record<
    string,
    { onS3: number; updated: number; already: number; failed: number }
  > = {};

  for (const lang of langs) {
    const keys = await listTutorKeys(s3, bucket, lang);
    console.log(`[${lang}] ${keys.length} tutor_* files on S3`);

    let updated = 0;
    let already = 0;
    let failed = 0;
    let done = 0;

    await mapPool(keys, concurrency, async (key) => {
      try {
        const head = await s3.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
        if ((head.CacheControl ?? '').trim() === AUDIO_CACHE_CONTROL) {
          already++;
        } else if (!confirm) {
          updated++;
        } else {
          // MetadataDirective=REPLACE drops anything not restated here
          await s3.send(
            new CopyObjectCommand({
              Bucket: bucket,
              Key: key,
              CopySource: `${bucket}/${key}`,
              MetadataDirective: 'REPLACE',
              ContentType: head.ContentType || contentTypeFor(key),
              CacheControl: AUDIO_CACHE_CONTROL,
            }),
          );
          updated++;
        }
      } catch (err) {
        failed++;
        console.error(`[${lang}] ${key} failed:`, (err as Error)?.message ?? err);
      }

      done++;
      if (done % 200 === 0 || done === keys.length) {
        console.log(
          `[${lang}] ${done}/${keys.length} (set=${updated} alreadyOk=${already} failed=${failed})`,
        );
      }
    });

    summary[lang] = { onS3: keys.length, updated, already, failed };
  }

  console.table(summary);
  console.log(confirm ? 'Done.' : 'Dry run complete — nothing changed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
