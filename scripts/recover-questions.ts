import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { promises as fs } from 'fs';
import path from 'path';
import { QuestionSyncStandaloneModule } from '../src/question-sync/question-sync-standalone.module';
import { QuestionSyncService } from '../src/question-sync/question-sync.service';
import { Question } from '../src/questions/entities/question.entity';
import { distinctQuestionIds } from './lib/pg-data-source';

type Lang = 'ka' | 'ru' | 'en';

type QuestionRow = {
  id: number;
  lang: Lang;
  question?: string;
  question_explained?: string;
  ai_tutor?: string;
};

type RecoveryReason =
  | 'missing_ru'
  | 'missing_en'
  | 'missing_ru_question'
  | 'missing_en_question'
  | 'missing_ka_explained'
  | 'missing_ru_explained'
  | 'missing_en_explained'
  | 'missing_ka_tutor'
  | 'missing_ru_tutor'
  | 'missing_en_tutor';

type RecoveryIssue = { id: number; reasons: RecoveryReason[] };
type Checkpoint = { lastProcessedId?: number; processedCount?: number };

const CHECKPOINT_PATH = path.resolve(
  process.cwd(),
  '.recovery-question-checkpoint.json',
);

const PLACEHOLDER_EXPLANATION_PREFIX = 'განმარტება მალე დაემატება';
const PLACEHOLDER_EXPLANATION_KEYWORD = 'იხილე კანონი საგზაო მოძრაობის შესახებ';

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    limit: 0,
    fromId: 0,
    dryRun: false,
    resetCheckpoint: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') parsed.dryRun = true;
    if (arg === '--reset-checkpoint') parsed.resetCheckpoint = true;
    if (arg.startsWith('--limit=')) {
      const n = Number.parseInt(arg.slice('--limit='.length), 10);
      if (Number.isFinite(n) && n > 0) parsed.limit = n;
    }
    if (arg.startsWith('--from-id=')) {
      const n = Number.parseInt(arg.slice('--from-id='.length), 10);
      if (Number.isFinite(n) && n > 0) parsed.fromId = n;
    }
  }

  return parsed;
}

function hasText(v?: string | null): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

function isPlaceholderExplanation(text?: string | null): boolean {
  if (!text) return true;
  const normalized = text.trim().toLowerCase();
  return (
    normalized.includes(PLACEHOLDER_EXPLANATION_PREFIX.toLowerCase()) ||
    normalized.includes(PLACEHOLDER_EXPLANATION_KEYWORD.toLowerCase())
  );
}

function containsGeorgian(text?: string | null): boolean {
  if (!text) return false;
  return /[ა-ჰ]/.test(text);
}

function containsCyrillic(text?: string | null): boolean {
  if (!text) return false;
  return /[А-Яа-яЁё]/.test(text);
}

function containsLatin(text?: string | null): boolean {
  if (!text) return false;
  return /[A-Za-z]/.test(text);
}

function isPredominantlyGeorgian(text?: string | null): boolean {
  if (!text) return false;
  const matches = text.match(/[ა-ჰ]/g);
  const count = matches ? matches.length : 0;
  if (count < 5) return false;
  return count / text.length > 0.05;
}

function collectIssues(rows: QuestionRow[]): RecoveryIssue[] {
  const byId = new Map<number, Partial<Record<Lang, QuestionRow>>>();
  for (const row of rows) {
    const rec = byId.get(row.id) ?? {};
    rec[row.lang] = row;
    byId.set(row.id, rec);
  }

  const issues: RecoveryIssue[] = [];
  for (const [id, rec] of byId) {
    const reasons: RecoveryReason[] = [];
    const ka = rec.ka;
    const ru = rec.ru;
    const en = rec.en;

    if (!ru) reasons.push('missing_ru');
    if (!en) reasons.push('missing_en');

    if (ru && !hasText(ru.question)) reasons.push('missing_ru_question');
    if (en && !hasText(en.question)) reasons.push('missing_en_question');

    if (!ka || isPlaceholderExplanation(ka.question_explained)) {
      reasons.push('missing_ka_explained');
    }
    if (
      !ru ||
      isPlaceholderExplanation(ru.question_explained) ||
      isPredominantlyGeorgian(ru.question_explained) ||
      !containsCyrillic(ru.question_explained)
    ) {
      reasons.push('missing_ru_explained');
    }
    if (
      !en ||
      isPlaceholderExplanation(en.question_explained) ||
      isPredominantlyGeorgian(en.question_explained) ||
      !containsLatin(en.question_explained)
    ) {
      reasons.push('missing_en_explained');
    }

    if (!ka || !hasText(ka.ai_tutor)) reasons.push('missing_ka_tutor');
    if (!ru || !hasText(ru.ai_tutor)) reasons.push('missing_ru_tutor');
    if (!en || !hasText(en.ai_tutor)) reasons.push('missing_en_tutor');

    if (reasons.length > 0) {
      issues.push({ id, reasons });
    }
  }

  return issues.sort((a, b) => a.id - b.id);
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

async function main() {
  const { limit, fromId, dryRun, resetCheckpoint } = parseArgs();

  if (resetCheckpoint) {
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
    const questionRepo = app.get<Repository<Question>>(
      getRepositoryToken(Question),
    );

    const rows = (await questionRepo.find({
      where: { lang: In(['ka', 'ru', 'en']) },
      select: ['id', 'lang', 'question', 'question_explained', 'ai_tutor'],
    })) as QuestionRow[];

    const issues = collectIssues(rows);
    const checkpoint = await readCheckpoint();
    const checkpointFromId = checkpoint.lastProcessedId ?? 0;
    const effectiveFromId = Math.max(fromId, checkpointFromId + 1);

    const targets = issues.filter((x) => x.id >= effectiveFromId);
    const limitedTargets = limit > 0 ? targets.slice(0, limit) : targets;

    console.log(
      `Found ${issues.length} problematic ID(s). Will process ${limitedTargets.length} from ID >= ${effectiveFromId}.`,
    );

    if (issues.length > 0) {
      const sample = issues
        .slice(0, 10)
        .map((x) => `${x.id}(${x.reasons.slice(0, 2).join(',')})`)
        .join(', ');
      console.log(`Sample issues: ${sample}${issues.length > 10 ? ' ...' : ''}`);
    }

    if (dryRun || limitedTargets.length === 0) {
      console.log(
        dryRun
          ? 'Dry run finished. No sync executed.'
          : 'Nothing left to process.',
      );
      return;
    }

    const allIds = await distinctQuestionIds(questionRepo);
    const indexById = new Map<number, number>();
    allIds.forEach((id, index) => indexById.set(id, index));

    let success = 0;
    let failures = 0;

    for (let i = 0; i < limitedTargets.length; i++) {
      const item = limitedTargets[i];
      const offset = indexById.get(item.id);

      if (offset === undefined) {
        console.warn(`[${i + 1}/${limitedTargets.length}] Skip ID ${item.id} (not found in distinct IDs)`);
        failures++;
        continue;
      }

      console.log(
        `[${i + 1}/${limitedTargets.length}] Recovering ID ${item.id} | reasons: ${item.reasons.join(', ')}`,
      );

      try {
        const res = await sync.runSync({ limit: 1, offset });
        if (res.errors > 0) failures++;
        else success++;
      } catch (err) {
        failures++;
        console.error(`ID ${item.id} failed:`, err);
      }

      await writeCheckpoint({
        lastProcessedId: item.id,
        processedCount: (checkpoint.processedCount ?? 0) + i + 1,
      });
    }

    console.log(
      `Recovery done. success=${success}, failures=${failures}, checkpoint=${CHECKPOINT_PATH}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Recovery script failed:', err);
  process.exit(1);
});
