import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAnswer } from '../entities/user-answer.entity';
import {
  MAX_HISTORY_FOR_WEIGHTING,
  MAX_WEAKNESS_IDS_CAP,
} from '../../common/constants/exam.constants.js';
import type { WeaknessIds } from './selection.types.js';

/**
 * Computes user weakness from answer history (Postgres).
 * Mistake = more wrong than right; Success = more right than wrong.
 */
@Injectable()
export class WeaknessService {
  constructor(
    @InjectRepository(UserAnswer)
    private readonly userAnswerRepo: Repository<UserAnswer>,
  ) {}

  async getTotalAnswerCount(userId: number): Promise<number> {
    return this.userAnswerRepo.count({
      where: { attempt: { userId } },
    });
  }

  async getWeaknessIds(userId: number): Promise<WeaknessIds> {
    const rows = await this.userAnswerRepo
      .createQueryBuilder('a')
      .innerJoin('a.attempt', 't')
      .where('t.userId = :userId', { userId })
      .select(['a.questionId', 'a.subject', 'a.correct'])
      .orderBy('a.createdAt', 'DESC')
      .limit(MAX_HISTORY_FOR_WEIGHTING)
      .getRawMany<{ a_questionId: number; a_subject: number; a_correct: boolean }>();

    const { mistakeIds, successIds, mistakeSubjects, successSubjects } =
      this.computeWeaknessFromRows(rows);

    return {
      mistakeIds: mistakeIds.slice(0, MAX_WEAKNESS_IDS_CAP),
      successIds: successIds.slice(0, MAX_WEAKNESS_IDS_CAP),
      mistakeSubjects: mistakeSubjects.slice(0, MAX_WEAKNESS_IDS_CAP),
      successSubjects: successSubjects.slice(0, MAX_WEAKNESS_IDS_CAP),
    };
  }

  private computeWeaknessFromRows(
    rows: { a_questionId: number; a_subject: number; a_correct: boolean }[],
  ): WeaknessIds {
    const bySubject = new Map<number, number>();
    const byQuestion = new Map<number, number>();

    for (const r of rows) {
      const delta = r.a_correct ? -1 : 1;
      bySubject.set(r.a_subject, (bySubject.get(r.a_subject) ?? 0) + delta);
      byQuestion.set(r.a_questionId, (byQuestion.get(r.a_questionId) ?? 0) + delta);
    }

    const mistakeIds: number[] = [];
    const successIds: number[] = [];
    const mistakeSubjects: number[] = [];
    const successSubjects: number[] = [];

    for (const [id, n] of byQuestion) {
      if (n > 0) mistakeIds.push(id);
      else if (n < 0) successIds.push(id);
    }
    for (const [s, n] of bySubject) {
      if (n > 0) mistakeSubjects.push(s);
      else if (n < 0) successSubjects.push(s);
    }

    return { mistakeIds, successIds, mistakeSubjects, successSubjects };
  }
}
