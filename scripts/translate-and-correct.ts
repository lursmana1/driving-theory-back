import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { In, Repository } from 'typeorm';
import { promises as fs } from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { QuestionSyncStandaloneModule } from '../src/question-sync/question-sync-standalone.module';
import { QuestionSyncService } from '../src/question-sync/question-sync.service';
import { Question } from '../src/questions/entities/question.entity';
import {
  distinctQuestionIds,
  upsertQuestionRow,
} from './lib/pg-data-source';

type Lang = 'ka' | 'ru' | 'en';

type QuestionRow = {
  id: number;
  lang: Lang;
  question?: string;
  question_explained?: string;
  ai_tutor?: string;
  correct_answer?: string;
  answer_1?: string;
  answer_2?: string;
  answer_3?: string;
  answer_4?: string;
  subject?: number;
  categories?: number[];
  hasImg?: number;
  img?: string;
  audio?: string;
};

type Checkpoint = {
  lastIdProcessed?: number;
  correctionsDone?: number[];
  buildKaDone?: number[];
  enOnlyDone?: number[];
  ruOnlyDone?: number[];
};

const CHECKPOINT_PATH = path.resolve(
  process.cwd(),
  '.translate-correct-checkpoint.json',
);

const PLACEHOLDER_EXPLANATION_PREFIX = 'განმარტება მალე დაემატება';
const PLACEHOLDER_EXPLANATION_KEYWORD = 'იხილე კანონი საგზაო მოძრაობის შესახებ';

const DELAY_MS = 5000;
const MAX_RETRIES = 5;
const DEFAULT_MODEL = 'gemini-3.1-flash-lite-preview';

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    mode: 'all' as
      | 'all'
      | 'corrections'
      | 'build-ka'
      | 'from-en-only'
      | 'from-ru-only',
    limit: 0,
    dryRun: false,
    resetCheckpoint: false,
    ids: [] as number[],
  };
  for (const a of args) {
    if (a === '--dry-run') parsed.dryRun = true;
    else if (a === '--reset-checkpoint') parsed.resetCheckpoint = true;
    else if (a === '--corrections-only') parsed.mode = 'corrections';
    else if (a === '--build-ka-only') parsed.mode = 'build-ka';
    else if (a === '--from-en-only') parsed.mode = 'from-en-only';
    else if (a === '--from-ru-only') parsed.mode = 'from-ru-only';
    else if (a.startsWith('--limit=')) {
      const n = Number.parseInt(a.slice('--limit='.length), 10);
      if (Number.isFinite(n) && n > 0) parsed.limit = n;
    } else if (a.startsWith('--ids=')) {
      parsed.ids = a
        .slice('--ids='.length)
        .split(',')
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n));
    }
  }
  return parsed;
}

function hasText(v?: string): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}
function isPlaceholder(text?: string): boolean {
  if (!text) return true;
  const n = text.trim().toLowerCase();
  return (
    n.includes(PLACEHOLDER_EXPLANATION_PREFIX.toLowerCase()) ||
    n.includes(PLACEHOLDER_EXPLANATION_KEYWORD.toLowerCase())
  );
}
const containsGeorgian = (t?: string) => !!t && /[ა-ჰ]/.test(t);
const containsCyrillic = (t?: string) => !!t && /[А-Яа-яЁё]/.test(t);
const containsLatin = (t?: string) => !!t && /[A-Za-z]/.test(t);

function isPredominantlyGeorgian(text?: string): boolean {
  if (!text) return false;
  const matches = text.match(/[ა-ჰ]/g);
  const count = matches ? matches.length : 0;
  if (count < 5) return false;
  return count / text.length > 0.05;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(status: number): boolean {
  return status === 429 || status === 503;
}

function getRetryDelayMs(err: unknown): number {
  const details = (err as { errorDetails?: Array<{ retryDelay?: string }> })
    ?.errorDetails;
  if (details) {
    for (const d of details) {
      const s = d?.retryDelay;
      if (typeof s === 'string') {
        const sec = parseFloat(s.replace(/s$/, '').trim());
        if (Number.isFinite(sec)) return Math.max(1000, Math.ceil(sec * 1000));
      }
    }
  }
  const msg = (err as Error)?.message ?? '';
  const m = msg.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  if (m) {
    const sec = parseFloat(m[1]);
    if (Number.isFinite(sec)) return Math.max(1000, Math.ceil(sec * 1000));
  }
  return 15000;
}

async function readCheckpoint(): Promise<Checkpoint> {
  try {
    const raw = await fs.readFile(CHECKPOINT_PATH, 'utf-8');
    return JSON.parse(raw) as Checkpoint;
  } catch {
    return {};
  }
}
async function writeCheckpoint(data: Checkpoint): Promise<void> {
  await fs.writeFile(CHECKPOINT_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

type GroupedById = Map<number, Partial<Record<Lang, QuestionRow>>>;

function groupRowsById(rows: QuestionRow[]): GroupedById {
  const byId: GroupedById = new Map();
  for (const r of rows) {
    const rec = byId.get(r.id) ?? {};
    rec[r.lang] = r;
    byId.set(r.id, rec);
  }
  return byId;
}

function collectCorrectionTargets(byId: GroupedById): number[] {
  const out: number[] = [];
  for (const [id, rec] of byId) {
    const { ka, ru, en } = rec;
    if (!(ka && ru && en)) continue;
    const ruBad =
      isPlaceholder(ru.question_explained) ||
      isPredominantlyGeorgian(ru.question_explained) ||
      !containsCyrillic(ru.question_explained);
    const enBad =
      isPlaceholder(en.question_explained) ||
      isPredominantlyGeorgian(en.question_explained) ||
      !containsLatin(en.question_explained);
    const tutorBad =
      !hasText(ka.ai_tutor) || !hasText(ru.ai_tutor) || !hasText(en.ai_tutor);
    if (ruBad || enBad || tutorBad) out.push(id);
  }
  return out.sort((a, b) => a - b);
}

function collectBuildKaTargets(byId: GroupedById): number[] {
  const out: number[] = [];
  for (const [id, rec] of byId) {
    const { ka, ru, en } = rec;
    if (!ka && ru && en && hasText(ru.question) && hasText(en.question)) {
      out.push(id);
    }
  }
  return out.sort((a, b) => a - b);
}

function collectEnOnlyTargets(byId: GroupedById): number[] {
  const out: number[] = [];
  for (const [id, rec] of byId) {
    const { ka, ru, en } = rec;
    if (!ka && !ru && en && hasText(en.question)) {
      out.push(id);
    }
  }
  return out.sort((a, b) => a - b);
}

function collectRuOnlyTargets(byId: GroupedById): number[] {
  const out: number[] = [];
  for (const [id, rec] of byId) {
    const { ka, ru, en } = rec;
    if (!ka && !en && ru && hasText(ru.question)) {
      out.push(id);
    }
  }
  return out.sort((a, b) => a - b);
}

type KaTranslationResult = {
  ka_question: string;
  ka_answer_1: string;
  ka_answer_2: string;
  ka_answer_3: string;
  ka_answer_4: string;
};

type FanOutFromEnResult = {
  ka_question: string;
  ka_answer_1: string;
  ka_answer_2: string;
  ka_answer_3: string;
  ka_answer_4: string;
  ru_question: string;
  ru_answer_1: string;
  ru_answer_2: string;
  ru_answer_3: string;
  ru_answer_4: string;
  ka_explained: string;
  ru_explained: string;
  en_explained: string;
  ka_tutor: string;
  ru_tutor: string;
  en_tutor: string;
};

type FanOutFromRuResult = {
  ka_question: string;
  ka_answer_1: string;
  ka_answer_2: string;
  ka_answer_3: string;
  ka_answer_4: string;
  en_question: string;
  en_answer_1: string;
  en_answer_2: string;
  en_answer_3: string;
  en_answer_4: string;
  ka_explained: string;
  ru_explained: string;
  en_explained: string;
  ka_tutor: string;
  ru_tutor: string;
  en_tutor: string;
};

async function callGeminiJson<T>(
  genAI: GoogleGenerativeAI,
  modelName: string,
  prompt: string,
  validate: (parsed: T) => void,
): Promise<T> {
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: 'application/json' },
  });

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (!text) throw new Error('Empty response from Gemini');
      const parsed = JSON.parse(text.trim()) as T;
      validate(parsed);
      return parsed;
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      if (attempt < MAX_RETRIES && isRetryable(status ?? 0)) {
        const waitMs = getRetryDelayMs(err);
        console.warn(
          `  Gemini ${status === 429 ? '429' : '503'}, retry in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
        await sleep(waitMs);
      } else {
        break;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Gemini call failed');
}

async function expandFromEn(
  genAI: GoogleGenerativeAI,
  modelName: string,
  en: QuestionRow,
): Promise<FanOutFromEnResult> {
  const correctIdx = en.correct_answer || '';
  const prompt = `You are a Georgian driving instructor. I will provide an English driving exam question.

Translate the English question and answers into Georgian (ქართული) and Russian (русский). Preserve the order of answer choices and legal/technical terminology.

Generate a formal legal explanation in Georgian, Russian, and English (refer to the Georgian "Law on Road Traffic" where relevant) for the question_explained field.

Generate a friendly, simplified "AI Tutor" explanation in Georgian, Russian, and English for the ai_tutor field.

Focus on WHY the correct answer (index: ${correctIdx}) is right.

Source Question (EN): ${en.question || ''}
Source Answers (EN):
1) ${en.answer_1 || ''}
2) ${en.answer_2 || ''}
3) ${en.answer_3 || ''}
4) ${en.answer_4 || ''}

Correct Answer Index: ${correctIdx}

Return valid JSON only, no markdown:
{
  "ka_question": "...",
  "ka_answer_1": "...", "ka_answer_2": "...", "ka_answer_3": "...", "ka_answer_4": "...",
  "ru_question": "...",
  "ru_answer_1": "...", "ru_answer_2": "...", "ru_answer_3": "...", "ru_answer_4": "...",
  "ka_explained": "...",
  "ru_explained": "...",
  "en_explained": "...",
  "ka_tutor": "...",
  "ru_tutor": "...",
  "en_tutor": "..."
}`;

  return callGeminiJson<FanOutFromEnResult>(
    genAI,
    modelName,
    prompt,
    (parsed) => {
      if (!hasText(parsed.ka_question) || !containsGeorgian(parsed.ka_question)) {
        throw new Error('Missing/non-Georgian ka_question in fan-out-from-en');
      }
      if (!hasText(parsed.ru_question) || !containsCyrillic(parsed.ru_question)) {
        throw new Error('Missing/non-Cyrillic ru_question in fan-out-from-en');
      }
      if (!hasText(parsed.ka_explained) || !hasText(parsed.ru_explained) || !hasText(parsed.en_explained)) {
        throw new Error('Missing explained fields in fan-out-from-en');
      }
      if (!hasText(parsed.ka_tutor) || !hasText(parsed.ru_tutor) || !hasText(parsed.en_tutor)) {
        throw new Error('Missing tutor fields in fan-out-from-en');
      }
    },
  );
}

async function expandFromRu(
  genAI: GoogleGenerativeAI,
  modelName: string,
  ru: QuestionRow,
): Promise<FanOutFromRuResult> {
  const correctIdx = ru.correct_answer || '';
  const prompt = `You are a Georgian driving instructor. I will provide a Russian driving exam question.

Translate the Russian question and answers into Georgian (ქართული) and English. Preserve the order of answer choices and legal/technical terminology.

Generate a formal legal explanation in Georgian, Russian, and English (refer to the Georgian "Law on Road Traffic" where relevant) for the question_explained field.

Generate a friendly, simplified "AI Tutor" explanation in Georgian, Russian, and English for the ai_tutor field.

Focus on WHY the correct answer (index: ${correctIdx}) is right.

Source Question (RU): ${ru.question || ''}
Source Answers (RU):
1) ${ru.answer_1 || ''}
2) ${ru.answer_2 || ''}
3) ${ru.answer_3 || ''}
4) ${ru.answer_4 || ''}

Correct Answer Index: ${correctIdx}

Return valid JSON only, no markdown:
{
  "ka_question": "...",
  "ka_answer_1": "...", "ka_answer_2": "...", "ka_answer_3": "...", "ka_answer_4": "...",
  "en_question": "...",
  "en_answer_1": "...", "en_answer_2": "...", "en_answer_3": "...", "en_answer_4": "...",
  "ka_explained": "...",
  "ru_explained": "...",
  "en_explained": "...",
  "ka_tutor": "...",
  "ru_tutor": "...",
  "en_tutor": "..."
}`;

  return callGeminiJson<FanOutFromRuResult>(
    genAI,
    modelName,
    prompt,
    (parsed) => {
      if (!hasText(parsed.ka_question) || !containsGeorgian(parsed.ka_question)) {
        throw new Error('Missing/non-Georgian ka_question in fan-out-from-ru');
      }
      if (!hasText(parsed.en_question) || !containsLatin(parsed.en_question)) {
        throw new Error('Missing/non-Latin en_question in fan-out-from-ru');
      }
      if (!hasText(parsed.ka_explained) || !hasText(parsed.ru_explained) || !hasText(parsed.en_explained)) {
        throw new Error('Missing explained fields in fan-out-from-ru');
      }
      if (!hasText(parsed.ka_tutor) || !hasText(parsed.ru_tutor) || !hasText(parsed.en_tutor)) {
        throw new Error('Missing tutor fields in fan-out-from-ru');
      }
    },
  );
}

async function translateRuEnToKa(
  genAI: GoogleGenerativeAI,
  modelName: string,
  ru: QuestionRow,
  en: QuestionRow,
): Promise<KaTranslationResult> {
  const prompt = `You are a professional translator specializing in Georgian (ქართული).

Translate the following driving exam question and its four answer choices into Georgian.

Preserve legal/technical terminology and the order of answer choices.

Russian source:
Q: ${ru.question || ''}
1) ${ru.answer_1 || ''}
2) ${ru.answer_2 || ''}
3) ${ru.answer_3 || ''}
4) ${ru.answer_4 || ''}

English source:
Q: ${en.question || ''}
1) ${en.answer_1 || ''}
2) ${en.answer_2 || ''}
3) ${en.answer_3 || ''}
4) ${en.answer_4 || ''}

Return valid JSON only, no markdown:
{
  "ka_question": "...",
  "ka_answer_1": "...",
  "ka_answer_2": "...",
  "ka_answer_3": "...",
  "ka_answer_4": "..."
}`;

  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: 'application/json' },
  });

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      if (!text) throw new Error('Empty response from Gemini');
      const parsed = JSON.parse(text.trim()) as KaTranslationResult;
      if (
        !hasText(parsed.ka_question) ||
        !containsGeorgian(parsed.ka_question)
      ) {
        throw new Error(
          'Translation did not return Georgian text for ka_question',
        );
      }
      return parsed;
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      if (attempt < MAX_RETRIES && isRetryable(status ?? 0)) {
        const waitMs = getRetryDelayMs(err);
        console.warn(
          `  Gemini ${status === 429 ? '429' : '503'}, retry in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
        await sleep(waitMs);
      } else {
        break;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Gemini call failed');
}

async function main() {
  const opts = parseArgs();

  if (opts.resetCheckpoint) {
    try {
      await fs.unlink(CHECKPOINT_PATH);
      console.log(`Checkpoint reset: ${CHECKPOINT_PATH}`);
    } catch {
      // ignore
    }
  }

  const app = await NestFactory.createApplicationContext(
    QuestionSyncStandaloneModule,
  );

  try {
    const sync = app.get(QuestionSyncService);
    const config = app.get(ConfigService);
    const questionRepo = app.get<Repository<Question>>(
      getRepositoryToken(Question),
    );

    const apiKey = config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY not set — translation steps require it.',
      );
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = config.get<string>('GEMINI_MODEL') || DEFAULT_MODEL;

    const rows = (await questionRepo.find({
      where: { lang: In(['ka', 'ru', 'en']) },
      select: [
        'id',
        'lang',
        'question',
        'question_explained',
        'ai_tutor',
        'correct_answer',
        'answer_1',
        'answer_2',
        'answer_3',
        'answer_4',
        'subject',
        'categories',
        'hasImg',
        'img',
        'audio',
      ],
    })) as QuestionRow[];

    const byId = groupRowsById(rows);

    let correctionTargets = collectCorrectionTargets(byId);
    let buildKaTargets = collectBuildKaTargets(byId);
    let enOnlyTargets = collectEnOnlyTargets(byId);
    let ruOnlyTargets = collectRuOnlyTargets(byId);

    if (opts.ids.length > 0) {
      const set = new Set(opts.ids);
      correctionTargets = correctionTargets.filter((id) => set.has(id));
      buildKaTargets = buildKaTargets.filter((id) => set.has(id));
      enOnlyTargets = enOnlyTargets.filter((id) => set.has(id));
      ruOnlyTargets = ruOnlyTargets.filter((id) => set.has(id));
    }

    const checkpoint = await readCheckpoint();
    const correctionsDone = new Set<number>(checkpoint.correctionsDone ?? []);
    const buildKaDone = new Set<number>(checkpoint.buildKaDone ?? []);
    const enOnlyDone = new Set<number>(checkpoint.enOnlyDone ?? []);
    const ruOnlyDone = new Set<number>(checkpoint.ruOnlyDone ?? []);

    correctionTargets = correctionTargets.filter((id) => !correctionsDone.has(id));
    buildKaTargets = buildKaTargets.filter((id) => !buildKaDone.has(id));
    enOnlyTargets = enOnlyTargets.filter((id) => !enOnlyDone.has(id));
    ruOnlyTargets = ruOnlyTargets.filter((id) => !ruOnlyDone.has(id));

    if (opts.limit > 0) {
      correctionTargets = correctionTargets.slice(0, opts.limit);
      buildKaTargets = buildKaTargets.slice(0, opts.limit);
      enOnlyTargets = enOnlyTargets.slice(0, opts.limit);
      ruOnlyTargets = ruOnlyTargets.slice(0, opts.limit);
    }

    const wantCorrections = opts.mode === 'all' || opts.mode === 'corrections';
    const wantBuildKa = opts.mode === 'all' || opts.mode === 'build-ka';
    const wantFromEn = opts.mode === 'all' || opts.mode === 'from-en-only';
    const wantFromRu = opts.mode === 'all' || opts.mode === 'from-ru-only';

    console.log('Mode:', opts.mode, '| dryRun:', opts.dryRun);
    if (wantCorrections) {
      console.log(
        `Correction targets (have ka+ru+en, bad content): ${correctionTargets.length}`,
      );
      if (correctionTargets.length)
        console.log(`  IDs: ${correctionTargets.join(',')}`);
    }
    if (wantBuildKa) {
      console.log(
        `Build-ka targets (missing ka, have ru+en): ${buildKaTargets.length}`,
      );
      if (buildKaTargets.length)
        console.log(`  IDs: ${buildKaTargets.join(',')}`);
    }
    if (wantFromEn) {
      console.log(
        `From-en-only targets (only en exists, build ka+ru): ${enOnlyTargets.length}`,
      );
      if (enOnlyTargets.length)
        console.log(
          `  IDs: ${enOnlyTargets.slice(0, 30).join(',')}${enOnlyTargets.length > 30 ? ',...' : ''}`,
        );
    }
    if (wantFromRu) {
      console.log(
        `From-ru-only targets (only ru exists, build ka+en): ${ruOnlyTargets.length}`,
      );
      if (ruOnlyTargets.length)
        console.log(`  IDs: ${ruOnlyTargets.join(',')}`);
    }
    if (opts.dryRun) {
      console.log('Dry run — no changes made.');
      return;
    }

    const allIds = await distinctQuestionIds(questionRepo);
    const indexById = new Map<number, number>();
    allIds.forEach((id, idx) => indexById.set(id, idx));

    let success = 0;
    let failures = 0;

    if (wantCorrections) {
      for (let i = 0; i < correctionTargets.length; i++) {
        const id = correctionTargets[i];
        const offset = indexById.get(id);
        console.log(
          `\n[correction ${i + 1}/${correctionTargets.length}] ID ${id} — retrying sync`,
        );
        if (offset === undefined) {
          console.warn('  Skip: ID not in distinct list');
          failures++;
          continue;
        }
        try {
          const res = await sync.runSync({ limit: 1, offset });
          if (res.errors > 0) {
            failures++;
          } else {
            success++;
            correctionsDone.add(id);
          }
        } catch (err) {
          failures++;
          console.error(`  Failed:`, err);
        }
        await writeCheckpoint({
          lastIdProcessed: id,
          correctionsDone: [...correctionsDone],
          buildKaDone: [...buildKaDone],
          enOnlyDone: [...enOnlyDone],
          ruOnlyDone: [...ruOnlyDone],
        });
      }
    }

    if (wantBuildKa) {
      for (let i = 0; i < buildKaTargets.length; i++) {
        const id = buildKaTargets[i];
        console.log(
          `\n[build-ka ${i + 1}/${buildKaTargets.length}] ID ${id} — translating ru/en -> ka`,
        );
        const rec = byId.get(id);
        if (!rec?.ru || !rec?.en) {
          console.warn('  Skip: missing ru or en');
          failures++;
          continue;
        }
        try {
          const ka = await translateRuEnToKa(genAI, modelName, rec.ru, rec.en);
          const ruRow = rec.ru;
          const enRow = rec.en;

          await upsertQuestionRow(questionRepo, {
            id,
            lang: 'ka',
            question: ka.ka_question,
            answer_1: ka.ka_answer_1,
            answer_2: ka.ka_answer_2,
            answer_3: ka.ka_answer_3,
            answer_4: ka.ka_answer_4,
            question_explained: '',
            ai_tutor: '',
            correct_answer:
              ruRow.correct_answer || enRow.correct_answer || '',
            subject: ruRow.subject ?? enRow.subject ?? null,
            categories: ruRow.categories || enRow.categories || [],
            hasImg: ruRow.hasImg ?? enRow.hasImg ?? 0,
            img: ruRow.img || enRow.img || '',
            audio: ruRow.audio || enRow.audio || '',
          });
          console.log(`  ka row upserted for ID ${id}`);

          const offset = indexById.get(id);
          if (offset !== undefined) {
            console.log(`  Running sync to fill explanations/tutors...`);
            const res = await sync.runSync({ limit: 1, offset });
            if (res.errors > 0) {
              failures++;
              console.warn(`  sync reported errors for ID ${id}`);
            } else {
              success++;
              buildKaDone.add(id);
            }
          } else {
            success++;
            buildKaDone.add(id);
          }

          await sleep(DELAY_MS);
        } catch (err) {
          failures++;
          console.error(`  Failed to build ka for ID ${id}:`, err);
        }
        await writeCheckpoint({
          lastIdProcessed: id,
          correctionsDone: [...correctionsDone],
          buildKaDone: [...buildKaDone],
          enOnlyDone: [...enOnlyDone],
          ruOnlyDone: [...ruOnlyDone],
        });
      }
    }

    if (wantFromEn) {
      for (let i = 0; i < enOnlyTargets.length; i++) {
        const id = enOnlyTargets[i];
        console.log(
          `\n[from-en ${i + 1}/${enOnlyTargets.length}] ID ${id} — fanning out en -> ka+ru, generating explained/tutor`,
        );
        const rec = byId.get(id);
        const enRow = rec?.en;
        if (!enRow || !hasText(enRow.question)) {
          console.warn('  Skip: missing en question');
          failures++;
          continue;
        }
        try {
          const fan = await expandFromEn(genAI, modelName, enRow);

          const baseShared = {
            correct_answer: enRow.correct_answer || '',
            subject: enRow.subject ?? null,
            categories: enRow.categories || [],
            hasImg: enRow.hasImg ?? 0,
            img: enRow.img || '',
            audio: enRow.audio || '',
          };

          await upsertQuestionRow(questionRepo, {
            id,
            lang: 'ka',
            ...baseShared,
            question: fan.ka_question,
            answer_1: fan.ka_answer_1,
            answer_2: fan.ka_answer_2,
            answer_3: fan.ka_answer_3,
            answer_4: fan.ka_answer_4,
            question_explained: fan.ka_explained,
            ai_tutor: fan.ka_tutor,
          });

          await upsertQuestionRow(questionRepo, {
            id,
            lang: 'ru',
            ...baseShared,
            question: fan.ru_question,
            answer_1: fan.ru_answer_1,
            answer_2: fan.ru_answer_2,
            answer_3: fan.ru_answer_3,
            answer_4: fan.ru_answer_4,
            question_explained: fan.ru_explained,
            ai_tutor: fan.ru_tutor,
          });

          await questionRepo.update(
            { id, lang: 'en' },
            {
              question_explained: fan.en_explained,
              ai_tutor: fan.en_tutor,
            },
          );

          success++;
          enOnlyDone.add(id);
          console.log(`  Filled ka+ru and en explained/tutor for ID ${id}`);
          await sleep(DELAY_MS);
        } catch (err) {
          failures++;
          console.error(`  Failed fan-out-from-en for ID ${id}:`, err);
        }
        await writeCheckpoint({
          lastIdProcessed: id,
          correctionsDone: [...correctionsDone],
          buildKaDone: [...buildKaDone],
          enOnlyDone: [...enOnlyDone],
          ruOnlyDone: [...ruOnlyDone],
        });
      }
    }

    if (wantFromRu) {
      for (let i = 0; i < ruOnlyTargets.length; i++) {
        const id = ruOnlyTargets[i];
        console.log(
          `\n[from-ru ${i + 1}/${ruOnlyTargets.length}] ID ${id} — fanning out ru -> ka+en, generating explained/tutor`,
        );
        const rec = byId.get(id);
        const ruRow = rec?.ru;
        if (!ruRow || !hasText(ruRow.question)) {
          console.warn('  Skip: missing ru question');
          failures++;
          continue;
        }
        try {
          const fan = await expandFromRu(genAI, modelName, ruRow);

          const baseShared = {
            correct_answer: ruRow.correct_answer || '',
            subject: ruRow.subject ?? null,
            categories: ruRow.categories || [],
            hasImg: ruRow.hasImg ?? 0,
            img: ruRow.img || '',
            audio: ruRow.audio || '',
          };

          await upsertQuestionRow(questionRepo, {
            id,
            lang: 'ka',
            ...baseShared,
            question: fan.ka_question,
            answer_1: fan.ka_answer_1,
            answer_2: fan.ka_answer_2,
            answer_3: fan.ka_answer_3,
            answer_4: fan.ka_answer_4,
            question_explained: fan.ka_explained,
            ai_tutor: fan.ka_tutor,
          });

          await upsertQuestionRow(questionRepo, {
            id,
            lang: 'en',
            ...baseShared,
            question: fan.en_question,
            answer_1: fan.en_answer_1,
            answer_2: fan.en_answer_2,
            answer_3: fan.en_answer_3,
            answer_4: fan.en_answer_4,
            question_explained: fan.en_explained,
            ai_tutor: fan.en_tutor,
          });

          await questionRepo.update(
            { id, lang: 'ru' },
            {
              question_explained: fan.ru_explained,
              ai_tutor: fan.ru_tutor,
            },
          );

          success++;
          ruOnlyDone.add(id);
          console.log(`  Filled ka+en and ru explained/tutor for ID ${id}`);
          await sleep(DELAY_MS);
        } catch (err) {
          failures++;
          console.error(`  Failed fan-out-from-ru for ID ${id}:`, err);
        }
        await writeCheckpoint({
          lastIdProcessed: id,
          correctionsDone: [...correctionsDone],
          buildKaDone: [...buildKaDone],
          enOnlyDone: [...enOnlyDone],
          ruOnlyDone: [...ruOnlyDone],
        });
      }
    }

    console.log(
      `\nDone. success=${success}, failures=${failures}, checkpoint=${CHECKPOINT_PATH}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('translate-and-correct failed:', err);
  process.exit(1);
});
