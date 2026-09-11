/**
 * Replace Georgian tutor audio (wav/mp3) with locally prepared WebM.
 *
 * Reads tutor_{id}.webm from a local folder, uploads to audio/ka/tutor_{id}.webm
 * with the shared Cache-Control, repoints questions.audio, then deletes the old
 * wav/mp3 object for that id.
 *
 * Order matters: upload -> DB update -> delete, so questions.audio never points
 * at a key that is already gone. An id is only ever cleaned up after its webm
 * is live, so ids without a local webm keep their existing wav/mp3 untouched.
 *
 * npm swallows `--confirm` as its own config flag, so call ts-node directly for
 * anything but the dry run.
 *
 * Usage:
 *   npm run audio:ka:webm                                   # dry run
 *   npx ts-node -r tsconfig-paths/register scripts/migrate-georgian-audio-to-webm.ts --confirm
 *   ... --confirm --keep-old                                # upload but keep wav/mp3
 *   ... --confirm --prune-orphans                           # also drop wav/mp3 for archived ids
 *   ... --confirm --dir=D:\clips\ka
 */
import 'dotenv/config';
import { readdir, readFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { initPg } from './lib/pg-data-source';

const DEFAULT_DIR = path.join(os.homedir(), 'Desktop', 'all-audio', 'ka');
const DEFAULT_BUCKET = 'prava-ge-assets';
/** Keys are stable and overwritten on re-sync, so this is not `immutable` */
const AUDIO_CACHE_CONTROL = 'public, max-age=2592000';
const MIN_WEBM_BYTES = Number(process.env.AUDIO_MIN_WEBM_BYTES ?? 400);
/** S3 caps DeleteObjects at 1000 keys per call */
const DELETE_BATCH = 1000;

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function getPublicUrl(bucket: string, region: string, key: string): string {
  const base =
    process.env.AWS_PUBLIC_BASE_URL ||
    `https://${bucket}.s3.${region}.amazonaws.com`;
  return `${base.replace(/\/$/, '')}/${key}`;
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

/** id -> local tutor_{id}.webm path */
async function listLocalWebm(dir: string): Promise<Map<number, string>> {
  const byId = new Map<number, string>();
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile()) continue;
    const m = e.name.match(/^tutor_(\d+)\.webm$/i);
    if (!m) continue;
    byId.set(Number(m[1]), path.join(dir, e.name));
  }
  return byId;
}

/** id -> existing audio/ka keys (any extension) */
async function listS3KaKeys(
  s3: S3Client,
  bucket: string,
): Promise<Map<number, string[]>> {
  const byId = new Map<number, string[]>();
  let token: string | undefined;

  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: 'audio/ka/',
        ContinuationToken: token,
      }),
    );
    for (const obj of page.Contents ?? []) {
      const key = obj.Key;
      if (!key) continue;
      const m = key.match(/tutor_(\d+)\.(wav|mp3|webm)$/i);
      if (!m) continue;
      const id = Number(m[1]);
      byId.set(id, [...(byId.get(id) ?? []), key]);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  return byId;
}

async function main() {
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET || DEFAULT_BUCKET;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Missing AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in .env',
    );
  }

  const dir = path.resolve(argValue('dir') || DEFAULT_DIR);
  const confirm = process.argv.includes('--confirm');
  const keepOld = process.argv.includes('--keep-old');
  const concurrency = Number.parseInt(argValue('concurrency') || '8', 10);
  const limit = Number.parseInt(argValue('limit') || '0', 10);

  const s3 = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  const ds = await initPg();

  const local = await listLocalWebm(dir);
  const onS3 = await listS3KaKeys(s3, bucket);
  const dbRows = (await ds.query(
    `SELECT id, audio FROM questions WHERE lang = 'ka'`,
  )) as { id: number; audio: string | null }[];
  const dbById = new Map(dbRows.map((r) => [Number(r.id), r]));

  let ids = [...local.keys()].sort((a, b) => a - b);
  if (limit > 0) ids = ids.slice(0, limit);

  console.log(`Local webm: ${dir} (${local.size} files)`);
  console.log(`s3://${bucket}/audio/ka/ (${onS3.size} ids with audio)`);
  console.log(`ka questions in DB: ${dbRows.length}`);
  console.log(`Cache-Control: ${AUDIO_CACHE_CONTROL}`);
  if (!confirm) console.log('DRY RUN — pass --confirm to write.');

  let uploaded = 0;
  let repointed = 0;
  let tooSmall = 0;
  let noDbRow = 0;
  let failed = 0;
  let done = 0;
  const staleKeys: string[] = [];
  /** No live ka row, so nothing is repointed and the old object is left alone */
  const orphanIds: number[] = [];

  await mapPool(ids, concurrency, async (id) => {
    const file = local.get(id)!;
    const key = `audio/ka/tutor_${id}.webm`;
    const url = getPublicUrl(bucket, region, key);

    try {
      if (!dbById.has(id)) {
        // No ka question with this id (archived / never imported) — don't upload
        noDbRow++;
        if ((onS3.get(id) ?? []).length) orphanIds.push(id);
        return;
      }

      const body = await readFile(file);
      if (body.length < MIN_WEBM_BYTES) {
        tooSmall++;
        console.warn(`[${id}] webm too small (${body.length}b) — skip`);
        return;
      }

      if (confirm) {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: 'audio/webm',
            CacheControl: AUDIO_CACHE_CONTROL,
          }),
        );
      }
      uploaded++;

      if ((dbById.get(id)!.audio ?? '').trim() !== url) {
        if (confirm) {
          await ds.query(
            `UPDATE questions SET audio = $1 WHERE id = $2 AND lang = 'ka'`,
            [url, id],
          );
        }
        repointed++;
      }

      for (const old of onS3.get(id) ?? []) {
        if (old !== key) staleKeys.push(old);
      }
    } catch (err) {
      failed++;
      console.error(`[${id}] failed:`, (err as Error)?.message ?? err);
    }

    done++;
    if (done % 100 === 0 || done === ids.length) {
      console.log(
        `${done}/${ids.length} (uploaded=${uploaded} repointed=${repointed} failed=${failed})`,
      );
    }
  });

  let deleted = 0;
  if (keepOld) {
    console.log(`--keep-old: leaving ${staleKeys.length} old objects in place`);
  } else if (staleKeys.length) {
    for (let i = 0; i < staleKeys.length; i += DELETE_BATCH) {
      const batch = staleKeys.slice(i, i + DELETE_BATCH);
      if (confirm) {
        const res = await s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        for (const e of res.Errors ?? []) {
          console.error(`delete failed ${e.Key}: ${e.Message}`);
        }
        deleted += batch.length - (res.Errors?.length ?? 0);
      } else {
        deleted += batch.length;
      }
    }
    console.log(`${confirm ? 'Deleted' : 'Would delete'} ${deleted} old wav/mp3`);
  }

  // ids that still only have wav/mp3 because no webm was supplied
  const notMigrated = [...onS3.keys()].filter(
    (id) => !local.has(id) && !(onS3.get(id) ?? []).some((k) => /\.webm$/i.test(k)),
  );

  console.table({
    localWebm: local.size,
    uploaded,
    repointed,
    oldObjectsRemoved: keepOld ? 0 : deleted,
    skippedTooSmall: tooSmall,
    skippedNoDbRow: noDbRow,
    failed,
    stillOnWavMp3: notMigrated.length,
    orphanOldObjectsLeft: orphanIds.length,
  });

  if (orphanIds.length) {
    console.log(
      `Old wav/mp3 kept for ${orphanIds.length} ids with no live ka row (archived?): ${orphanIds
        .sort((a, b) => a - b)
        .slice(0, 40)
        .join(', ')}${orphanIds.length > 40 ? ', …' : ''}`,
    );
  }

  if (notMigrated.length) {
    console.log(
      `No local webm for ${notMigrated.length} ids — left on wav/mp3: ${notMigrated
        .slice(0, 40)
        .join(', ')}${notMigrated.length > 40 ? ', …' : ''}`,
    );
  }

  await ds.destroy();
  console.log(confirm ? 'Done.' : 'Dry run complete — nothing changed.');
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
