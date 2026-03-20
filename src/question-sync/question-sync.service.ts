import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Question, QuestionDocument } from '../questions/schemas/question.schema';

/** 5s between IDs ≈ 12 RPM — under 15 RPM free-tier limit */
const DELAY_MS = 5000;
const MAX_RETRIES = 5;
/** Internal API id (not display name). Override with GEMINI_MODEL in .env if needed */
const MODEL = 'gemini-3.1-flash-lite-preview';

/** Thrown on HTTP 404 so runSync can stop immediately — failed ID is not written to DB */
export class ModelIdMismatchError extends Error {
  constructor(message = 'Model ID mismatch') {
    super(message);
    this.name = 'ModelIdMismatchError';
  }
}

function isRetryable(status: number): boolean {
  return status === 429 || status === 503;
}

function getRetryDelayMs(err: unknown): number {
  const details = (err as { errorDetails?: Array<{ retryDelay?: string }> })?.errorDetails;
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
  const match = msg.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
  if (match) {
    const sec = parseFloat(match[1]);
    if (Number.isFinite(sec)) return Math.max(1000, Math.ceil(sec * 1000));
  }
  return 15000;
}

function hasAiTutor(row: unknown): boolean {
  const t = (row as { ai_tutor?: string })?.ai_tutor;
  return typeof t === 'string' && t.trim().length > 0;
}

export interface SyncOptions {
  /** Max number of IDs to process (default: 5 for testing) */
  limit?: number;
  /** Skip first N IDs (for Day 2: offset=1200) */
  offset?: number;
}

/** One API call per ID — Gemini returns all languages */
export interface GeminiResponse {
  ru_explained: string;
  en_explained: string;
  ka_tutor: string;
  ru_tutor: string;
  en_tutor: string;
}

@Injectable()
export class QuestionSyncService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor(
    @InjectModel(Question.name) private questionModel: Model<QuestionDocument>,
    private config: ConfigService,
  ) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async callGemini(prompt: string): Promise<GeminiResponse> {
    if (!this.genAI) {
      throw new Error('GEMINI_API_KEY is not set');
    }

    const model = this.genAI.getGenerativeModel({
      model: this.config.get<string>('GEMINI_MODEL') || MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      if (!text) {
        throw new Error('Empty response from Gemini');
      }

      return JSON.parse(text.trim()) as GeminiResponse;
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 404) {
        console.error(
          'Model ID mismatch: wrong internal model name for generateContent. Check GEMINI_MODEL in .env (e.g. gemini-3.1-flash-lite-preview) or ListModels in Google AI Studio.',
        );
        throw new ModelIdMismatchError();
      }
      throw err;
    }
  }

  async runSync(options: SyncOptions = {}): Promise<{ processed: number; errors: number }> {
    const limit = options.limit ?? 5;
    const offset = options.offset ?? 0;

    const ids = await this.questionModel
      .distinct('id')
      .then((arr) => arr.sort((a, b) => a - b) as number[]);

    const totalIds = ids.length;
    const slice = ids.slice(offset, offset + limit);
    const toProcess = slice.length;

    let processed = 0;
    let errors = 0;

    for (let i = 0; i < toProcess; i++) {
      const id = slice[i];
      const globalIndex = offset + i + 1;
      const displayTotal = Math.min(offset + limit, totalIds);

      try {
        const rows = await this.questionModel
          .find({ id })
          .lean()
          .exec();

        const byLang = Object.fromEntries(
          rows.map((r) => [r.lang, r]),
        ) as Record<string, { question: string; question_explained?: string; correct_answer?: string }>;

        const ka = byLang.ka;
        const ru = byLang.ru;
        const en = byLang.en;

        if (!ka || !ru || !en) {
          console.warn(`[ID ${id}] Skipping: missing ka, ru, or en row`);
          continue;
        }

        if (hasAiTutor(ka) && hasAiTutor(ru) && hasAiTutor(en)) {
          console.log(`[${globalIndex}/${displayTotal}] Skipping ID ${id} (ai_tutor already set for ka, ru, en)`);
          processed++;
          continue;
        }

        const ka_explanation = (ka.question_explained || '').trim();
        const ka_question = ka.question || '';
        const correct_answer = ka.correct_answer || ru.correct_answer || en.correct_answer || '';

        if (!ka_explanation) {
          console.warn(`[ID ${id}] Skipping: ka.question_explained is empty (master source required)`);
          continue;
        }

        const prompt = `You are a Georgian driving instructor. I will provide a Georgian driving exam question and its official legal explanation.

Generate a formal legal explanation in English and Russian for the question_explained column (translate from the Georgian law text).

Generate a friendly, simplified "AI Tutor" explanation in Georgian, Russian, and English for the ai_tutor column.

Always refer to the Georgian "Law on Road Traffic" where relevant.

Focus on WHY the correct answer (index: ${correct_answer}) is right.

Source Question (KA): ${ka_question}

Source Law (KA): ${ka_explanation}

Correct Answer Index: ${correct_answer}

Return valid JSON only, no markdown:
{ "ru_explained": "...", "en_explained": "...", "ka_tutor": "...", "ru_tutor": "...", "en_tutor": "..." }`;

        let result: GeminiResponse | null = null;
        let lastErr: unknown = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            result = await this.callGemini(prompt);
            break;
          } catch (err) {
            if (err instanceof ModelIdMismatchError) {
              throw err;
            }
            lastErr = err;
            const status = (err as { status?: number })?.status;
            if (attempt < MAX_RETRIES && isRetryable(status ?? 0)) {
              const waitMs = getRetryDelayMs(err);
              console.warn(`[${globalIndex}/${displayTotal}] ID ${id} ${status === 429 ? 'rate limited' : '503'}, retry in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
              await this.sleep(waitMs);
            } else {
              throw err;
            }
          }
        }

        if (!result) throw lastErr;

        const updates: Array<{ id: number; lang: string; data: Record<string, string> }> = [
          { id, lang: 'ka', data: { ai_tutor: result.ka_tutor } },
          {
            id,
            lang: 'ru',
            data: { question_explained: result.ru_explained, ai_tutor: result.ru_tutor },
          },
          {
            id,
            lang: 'en',
            data: { question_explained: result.en_explained, ai_tutor: result.en_tutor },
          },
        ];

        for (const { id: qId, lang, data } of updates) {
          await this.questionModel.updateOne({ id: qId, lang }, { $set: data }).exec();
        }

        processed++;
        console.log(`[${globalIndex}/${displayTotal}] Processed ID ${id}`);
      } catch (err) {
        if (err instanceof ModelIdMismatchError) {
          errors++;
          console.error(
            `[${globalIndex}/${displayTotal}] Sync stopped: Model ID mismatch. Fix GEMINI_MODEL and restart — ID ${id} was not saved and will retry next run.`,
          );
          return { processed, errors };
        }
        errors++;
        // DB not updated on failure — this ID can be retried after restart
        console.error(`[${globalIndex}/${displayTotal}] Error on ID ${id}:`, err);
      }

      if (i < toProcess - 1) {
        await this.sleep(DELAY_MS);
      }
    }

    return { processed, errors };
  }
}
