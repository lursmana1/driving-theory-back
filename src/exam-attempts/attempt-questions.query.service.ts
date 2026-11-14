import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Question } from '../questions/entities/question.entity';
import { parsePgBoolean } from '../common/utils/pg-row.util.js';
import {
  ARCHIVED_QUESTIONS_BY_IDS_SQL,
  QUESTIONS_ARCHIVED_EXISTS_SQL,
  toQuestionFromArchivedRow,
  type ArchivedQuestionRow,
} from './archived-questions.query.js';
import {
  missingQuestionIds,
  orderAttemptQuestions,
  type AttemptQuestion,
} from './attempt-questions.util.js';

/**
 * Questions of a ticket, read-side.
 *
 * - `findLive`: new tickets — live `questions` only.
 * - `findForAttempt`: past or running attempts — live first, then
 *   `questions_archived` for ids removed since, so the attempt stays complete.
 *   Exam selection, practice, trainer and stats never read the archive.
 */
@Injectable()
export class AttemptQuestionsQueryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AttemptQuestionsQueryService.name);

  constructor(
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
  ) {}

  /**
   * `SUBMIT_ANSWER_SQL` reads `questions_archived`; without the table every
   * exam answer fails. Log loudly instead of failing boot.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const rows = await this.questionRepo.query<{ exists: unknown }[]>(
        QUESTIONS_ARCHIVED_EXISTS_SQL,
      );
      if (!parsePgBoolean(rows[0]?.exists)) {
        this.logger.error(
          'Table questions_archived is missing: exam answers will fail. Run `npm run db:ensure-questions-archived`.',
        );
      }
    } catch (err) {
      this.logger.error(
        `Could not check for questions_archived: ${(err as Error).message}`,
      );
    }
  }

  /** Preserve ticket order from `ids` (IN-query order is undefined). */
  async findLive(ids: number[], lang: string): Promise<Question[]> {
    if (!ids.length) return [];
    const live = await this.loadLive(ids, lang);
    return orderAttemptQuestions(ids, live, []).map(
      ({ archived: _archived, ...q }) => q,
    );
  }

  async findForAttempt(
    ids: number[],
    lang: string,
  ): Promise<AttemptQuestion[]> {
    if (!ids.length) return [];
    const live = await this.loadLive(ids, lang);
    const missing = missingQuestionIds(ids, live);
    // The archive is only read when something is actually missing.
    const archived = missing.length
      ? (
          await this.questionRepo.query<ArchivedQuestionRow[]>(
            ARCHIVED_QUESTIONS_BY_IDS_SQL,
            [lang, missing],
          )
        ).map(toQuestionFromArchivedRow)
      : [];
    return orderAttemptQuestions(ids, live, archived);
  }

  private loadLive(ids: number[], lang: string): Promise<Question[]> {
    return this.questionRepo
      .createQueryBuilder('q')
      .where('q.lang = :lang', { lang })
      .andWhere('q.id IN (:...ids)', { ids })
      .getMany();
  }
}
