import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { DEFAULT_LANG } from '../common/constants/lang.constants.js';
import { parsePgBoolean, parsePgInt } from '../common/utils/pg-row.util.js';
import { toQuestionProgressView } from '../question-progress/question-progress.util.js';
import type { QuestionProgressView } from '../question-progress/question-progress.types.js';
import {
  RECORD_PRACTICE_SQL,
  type RecordPracticeRow,
} from './record-practice.query.js';

export type RecordPracticeInput = {
  questionId: number;
  lang?: string;
  /** If omitted / empty → seen-only (coverage credit, no grade). */
  chosenAnswer?: string | null;
};

export type RecordPracticeResult = {
  questionId: number;
  lang: string;
  subject: number | null;
  correct: boolean | null;
  seenOnly: boolean;
  /** Mistake-trainer state after this answer; null for seen-only calls. */
  progress: QuestionProgressView | null;
};

@Injectable()
export class PracticeAnswersService {
  constructor(
    @InjectEntityManager()
    private readonly manager: EntityManager,
  ) {}

  /**
   * Upsert practice row for coverage (+ optional correct/wrong) and, when
   * graded, the question's progress. One atomic statement, so concurrent
   * calls for the same question need no retry.
   */
  async record(
    userId: number,
    input: RecordPracticeInput,
  ): Promise<RecordPracticeResult> {
    const lang = (input.lang ?? DEFAULT_LANG).trim() || DEFAULT_LANG;
    const rawChoice = input.chosenAnswer?.trim() ?? '';
    const chosen = rawChoice.length === 0 ? null : rawChoice;

    const [row] = await this.manager.query<RecordPracticeRow[]>(
      RECORD_PRACTICE_SQL,
      [userId, input.questionId, lang, chosen],
    );
    if (!row) {
      throw new NotFoundException(
        `Question ${input.questionId} (${lang}) not found in live bank`,
      );
    }

    const correct = row.correct == null ? null : parsePgBoolean(row.correct);
    return {
      questionId: parsePgInt(row.questionId),
      lang: row.lang,
      subject: row.subject == null ? null : parsePgInt(row.subject),
      correct,
      seenOnly: correct == null,
      progress:
        chosen == null
          ? null
          : toQuestionProgressView(
              {
                wrongCount: row.wrongCount ?? 0,
                correctCount: row.correctCount ?? 0,
                box: row.box ?? 0,
                dueAt: row.dueAt,
                clearedAt: row.clearedAt,
                reviewsLeft: row.reviewsLeft ?? 0,
              },
              new Date(),
            ),
    };
  }
}
