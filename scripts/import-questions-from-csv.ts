import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { initPg, upsertQuestionRow } from './lib/pg-data-source';
import { Question } from '../src/questions/entities/question.entity';
import { In } from 'typeorm';

type Lang = 'ka' | 'ru' | 'en';
type AnyRow = Record<string, unknown>;

type ImportArgs = {
  kaPath: string;
  ruPath: string;
  enPath: string;
  dropQuestions: boolean;
};

type NormalizedRow = {
  id: number;
  question?: string;
  question_explained?: string;
  correct_answer?: string;
  answer_1?: string;
  answer_2?: string;
  answer_3?: string;
  answer_4?: string;
  ai_tutor?: string;
  hasImg?: number;
  img?: string;
  audio?: string;
  subject?: number;
  categories?: number[];
};

function parseArgs(): ImportArgs {
  const args = process.argv.slice(2);
  const out: ImportArgs = {
    kaPath: '',
    ruPath: '',
    enPath: '',
    dropQuestions: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--ka=')) out.kaPath = arg.slice('--ka='.length);
    if (arg.startsWith('--ru=')) out.ruPath = arg.slice('--ru='.length);
    if (arg.startsWith('--en=')) out.enPath = arg.slice('--en='.length);
    if (arg === '--drop-questions') out.dropQuestions = true;
  }

  if (!out.kaPath || !out.ruPath || !out.enPath) {
    throw new Error(
      'Usage: npm run import:questions:csv -- --ka=./ka.csv --ru=./ru.csv --en=./en.csv [--drop-questions]',
    );
  }

  return out;
}

function parseCsv(text: string): AnyRow[] {
  const rows: string[][] = [];
  let cur = '';
  let row: string[] = [];
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i++;
      continue;
    }

    if (!inQuotes && ch === ',') {
      row.push(cur);
      cur = '';
      i++;
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cur);
      cur = '';
      if (row.some((v) => v.length > 0)) rows.push(row);
      row = [];
      i++;
      continue;
    }

    cur += ch;
    i++;
  }

  row.push(cur);
  if (row.some((v) => v.length > 0)) rows.push(row);
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);

  return dataRows.map((r) => {
    const rec: AnyRow = {};
    headers.forEach((h, idx) => {
      rec[h] = (r[idx] ?? '').trim();
    });
    return rec;
  });
}

function getFirstValue(row: AnyRow, aliases: string[]): unknown {
  for (const k of aliases) {
    const v = row[k];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function toCleanString(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

function toIntOrUndefined(v: unknown): number | undefined {
  const s = toCleanString(v);
  if (!s) return undefined;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
}

function toStringOrUndefined(v: unknown): string | undefined {
  const s = toCleanString(v);
  return s ? s : undefined;
}

function parseCategories(v: unknown): number[] | undefined {
  if (Array.isArray(v)) {
    const out = v
      .map((x) => Number.parseInt(String(x), 10))
      .filter((x) => Number.isFinite(x));
    return out.length ? out : undefined;
  }

  const s = toCleanString(v);
  if (!s) return undefined;

  const trimmed = s.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const arr = JSON.parse(trimmed) as unknown[];
      const out = arr
        .map((x) => Number.parseInt(String(x), 10))
        .filter((x) => Number.isFinite(x));
      return out.length ? out : undefined;
    } catch {
      // fallback below
    }
  }

  const parts = trimmed
    .split(/[|;,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const nums = parts
    .map((x) => Number.parseInt(x, 10))
    .filter((x) => Number.isFinite(x));
  return nums.length ? nums : undefined;
}

function normalizeRow(row: AnyRow): NormalizedRow | null {
  const id = toIntOrUndefined(
    getFirstValue(row, ['id', 'ID', 'question_id', 'questionId']),
  );
  if (!id) return null;

  return {
    id,
    question: toStringOrUndefined(getFirstValue(row, ['question', 'text'])),
    question_explained: toStringOrUndefined(
      getFirstValue(row, ['question_explained', 'explained', 'explanation']),
    ),
    correct_answer: toStringOrUndefined(
      getFirstValue(row, ['correct_answer', 'correctAnswer']),
    ),
    answer_1: toStringOrUndefined(getFirstValue(row, ['answer_1', 'answer1'])),
    answer_2: toStringOrUndefined(getFirstValue(row, ['answer_2', 'answer2'])),
    answer_3: toStringOrUndefined(getFirstValue(row, ['answer_3', 'answer3'])),
    answer_4: toStringOrUndefined(getFirstValue(row, ['answer_4', 'answer4'])),
    ai_tutor: toStringOrUndefined(getFirstValue(row, ['ai_tutor', 'tutor', 'aiTutor'])),
    hasImg: toIntOrUndefined(getFirstValue(row, ['hasImg', 'has_img'])),
    img: toStringOrUndefined(getFirstValue(row, ['img', 'image', 'image_url'])),
    audio: toStringOrUndefined(getFirstValue(row, ['audio', 'audio_url'])),
    subject: toIntOrUndefined(getFirstValue(row, ['subject', 'subject_id'])),
    categories: parseCategories(getFirstValue(row, ['categories', 'category_ids'])),
  };
}

function compactSet(doc: NormalizedRow, lang: Lang): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  const maybe = <K extends keyof NormalizedRow>(key: K) => {
    const value = doc[key];
    if (value !== undefined && value !== '') set[String(key)] = value;
  };

  maybe('question');
  maybe('question_explained');
  maybe('correct_answer');
  maybe('answer_1');
  maybe('answer_2');
  maybe('answer_3');
  maybe('answer_4');
  maybe('ai_tutor');
  maybe('hasImg');
  maybe('img');
  maybe('audio');
  maybe('subject');
  maybe('categories');

  return set;
}

async function readCsvFile(filePath: string): Promise<NormalizedRow[]> {
  const abs = path.resolve(process.cwd(), filePath);
  const text = await fs.readFile(abs, 'utf-8');
  const trimmed = text.trim();
  let raw: AnyRow[];

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`JSON file must contain an array: ${filePath}`);
    }
    raw = parsed as AnyRow[];
  } else {
    raw = parseCsv(text);
  }

  return raw
    .map(normalizeRow)
    .filter((x): x is NormalizedRow => Boolean(x))
    .sort((a, b) => a.id - b.id);
}


async function main() {
  const { kaPath, ruPath, enPath, dropQuestions } = parseArgs();

  const [kaRows, ruRows, enRows] = await Promise.all([
    readCsvFile(kaPath),
    readCsvFile(ruPath),
    readCsvFile(enPath),
  ]);

  console.log(
    `CSV rows loaded | ka=${kaRows.length}, ru=${ruRows.length}, en=${enRows.length}`,
  );

  const ds = await initPg();
  const repo = ds.getRepository(Question);

  try {
    if (dropQuestions) {
      console.log('Truncating questions table...');
      await ds.query('TRUNCATE questions');
    }

    let upserts = 0;
    let processed = 0;

    const applyRows = async (rows: NormalizedRow[], lang: Lang) => {
      for (const row of rows) {
        const set = compactSet(row, lang);
        await upsertQuestionRow(repo, {
          id: row.id,
          lang,
          question: String(set.question ?? ''),
          correct_answer: (set.correct_answer as string) ?? null,
          answer_1: (set.answer_1 as string) ?? null,
          answer_2: (set.answer_2 as string) ?? null,
          answer_3: (set.answer_3 as string) ?? null,
          answer_4: (set.answer_4 as string) ?? null,
          question_explained: (set.question_explained as string) ?? null,
          ai_tutor: (set.ai_tutor as string) ?? null,
          hasImg: (set.hasImg as number) ?? 0,
          img: (set.img as string) ?? null,
          audio: (set.audio as string) ?? null,
          subject: (set.subject as number) ?? null,
          categories: (set.categories as number[]) ?? [],
        });
        processed++;
        upserts++;
        if (processed % 500 === 0) {
          console.log(`Processed ${processed} records...`);
        }
      }
    };

    await applyRows(kaRows, 'ka');
    await applyRows(ruRows, 'ru');
    await applyRows(enRows, 'en');

    const total = await repo.count({
      where: { lang: In(['ka', 'ru', 'en']) },
    });
    console.log(
      `Import complete. upserts=${upserts}, total rows in questions=${total}`,
    );
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('CSV import failed:', err);
  process.exit(1);
});
