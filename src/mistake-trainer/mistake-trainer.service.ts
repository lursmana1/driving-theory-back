import { Injectable } from '@nestjs/common';
import { TRAINER_SESSION_DEFAULT_LIMIT } from '../common/constants/question-progress.constants.js';
import { parsePgInt } from '../common/utils/pg-row.util.js';
import { toQuestionProgressView } from '../question-progress/question-progress.util.js';
import { MistakeTrainerQueryService } from './mistake-trainer.query.service.js';
import type {
  TrainerFilter,
  TrainerSessionItem,
  TrainerSessionResponse,
  TrainerSessionRow,
  TrainerSummary,
  TrainerSummaryRow,
} from './mistake-trainer.types.js';

function toSummary(row: TrainerSummaryRow | undefined): TrainerSummary {
  return {
    activeMistakes: parsePgInt(row?.activeMistakes),
    dueNow: parsePgInt(row?.dueNow),
    clearedRecently: parsePgInt(row?.clearedRecently),
    nextDueAt: row?.nextDueAt == null ? null : new Date(row.nextDueAt),
  };
}

function toSessionItem(row: TrainerSessionRow, now: Date): TrainerSessionItem {
  const {
    wrongCount,
    correctCount,
    box,
    dueAt,
    clearedAt,
    reviewsLeft,
    ...question
  } = row;
  return {
    question: {
      ...question,
      id: parsePgInt(question.id),
      hasImg: parsePgInt(question.hasImg),
      subject: question.subject == null ? null : parsePgInt(question.subject),
    },
    progress: toQuestionProgressView(
      { wrongCount, correctCount, box, dueAt, clearedAt, reviewsLeft },
      now,
    ),
  };
}

/**
 * Mistake trainer: drill the user's active mistakes. Answers go through
 * POST /practice-answers, which moves each question through its reviews.
 */
@Injectable()
export class MistakeTrainerService {
  constructor(private readonly queries: MistakeTrainerQueryService) {}

  async getSummary(filter: TrainerFilter): Promise<TrainerSummary> {
    return toSummary(await this.queries.loadSummary(filter));
  }

  async getSession(
    filter: TrainerFilter,
    limit = TRAINER_SESSION_DEFAULT_LIMIT,
  ): Promise<TrainerSessionResponse> {
    const [rows, summary] = await Promise.all([
      this.queries.loadSession(filter, limit),
      this.queries.loadSummary(filter),
    ]);
    const now = new Date();
    return {
      data: rows.map((row) => toSessionItem(row, now)),
      summary: toSummary(summary),
    };
  }
}
