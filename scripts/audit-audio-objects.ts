/**
 * Read-only audit of audio/{lang}/ against questions.audio.
 *
 * Reports, per language:
 *   - object count per extension
 *   - ids holding more than one object (e.g. leftover wav next to a new webm)
 *   - rows whose audio URL points at a key that is not on S3 (broken playback)
 *   - objects no live row references (safe-to-delete candidates)
 *
 * Usage:
 *   npm run audio:audit
 *   npm run audio:audit --lang=ka
 */
import 'dotenv/config';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { initPg } from './lib/pg-data-source';

type Lang = 'ka' | 'en' | 'ru';

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function parseLangs(): Lang[] {
  const allowed: Lang[] = ['en', 'ru', 'ka'];
  const raw = (argValue('lang') || 'en,ru,ka')
    .split(',')
    .map((s) => s.trim().toLowerCase());
  const langs = raw.filter((l): l is Lang => allowed.includes(l as Lang));
  if (!langs.length) throw new Error(`--lang must be one of ${allowed.join(',')}`);
  return langs;
}

/** Trailing path of our public URL, i.e. the object key. */
function keyFromUrl(url: string): string | null {
  const m = url.trim().match(/(audio\/(?:en|ru|ka)\/[^?#]+)/i);
  return m ? m[1] : null;
}

async function listKeys(s3: S3Client, bucket: string, lang: Lang) {
  const byId = new Map<number, string[]>();
  const all = new Set<string>();
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
      if (!key || key.endsWith('/')) continue;
      all.add(key);
      const m = key.match(/tutor_(\d+)\.(wav|mp3|webm)$/i);
      if (!m) continue;
      const id = Number(m[1]);
      byId.set(id, [...(byId.get(id) ?? []), key]);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  return { byId, all };
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

  const s3 = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  const ds = await initPg();
  const langs = parseLangs();

  console.log(`Audit s3://${bucket}/audio/{${langs.join(',')}}/\n`);

  for (const lang of langs) {
    const { byId, all } = await listKeys(s3, bucket, lang);
    const rows = (await ds.query(
      `SELECT id, audio FROM questions WHERE lang = $1`,
      [lang],
    )) as { id: number; audio: string | null }[];

    const byExt = new Map<string, number>();
    for (const key of all) {
      const ext = (key.split('.').pop() || '?').toLowerCase();
      byExt.set(ext, (byExt.get(ext) ?? 0) + 1);
    }

    const duplicates = [...byId.entries()]
      .filter(([, keys]) => keys.length > 1)
      .map(([id, keys]) => ({ id, keys: keys.sort() }));

    const referenced = new Set<string>();
    const broken: number[] = [];
    let withAudio = 0;

    for (const row of rows) {
      const url = (row.audio ?? '').trim();
      if (!url) continue;
      withAudio++;
      const key = keyFromUrl(url);
      if (!key) continue;
      referenced.add(key);
      if (!all.has(key)) broken.push(Number(row.id));
    }

    const unreferenced = [...all].filter((k) => !referenced.has(k));

    console.log(`=== ${lang} ===`);
    console.log(
      `objects: ${all.size} (${[...byExt].map(([e, n]) => `${e}:${n}`).join(' ')})`,
    );
    console.log(`rows: ${rows.length}, with audio URL: ${withAudio}`);
    console.log(`ids with more than one object: ${duplicates.length}`);
    for (const d of duplicates.slice(0, 25)) {
      console.log(`   ${d.id}: ${d.keys.join(' + ')}`);
    }
    if (duplicates.length > 25) {
      console.log(`   … ${duplicates.length - 25} more`);
    }
    console.log(`rows pointing at a missing object: ${broken.length}`);
    if (broken.length) {
      console.log(`   ids: ${broken.slice(0, 40).join(', ')}`);
    }
    console.log(`objects no row references: ${unreferenced.length}`);
    if (unreferenced.length) {
      console.log(`   e.g. ${unreferenced.slice(0, 10).join(', ')}`);

      const ids = unreferenced
        .map((k) => Number(k.match(/tutor_(\d+)\./)?.[1]))
        .filter((n) => Number.isFinite(n));
      const archived = (await ds.query(
        `SELECT COUNT(DISTINCT id)::int AS n FROM questions_archived
         WHERE id = ANY($1::int[])`,
        [ids],
      )) as { n: number }[];
      console.log(
        `   of those ids, ${archived[0]?.n ?? 0}/${ids.length} are in questions_archived`,
      );
    }
    console.log('');
  }

  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
