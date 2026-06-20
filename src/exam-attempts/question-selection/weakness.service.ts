import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAnswer } from '../entities/user-answer.entity';
import {
  MAX_HISTORY_FOR_WEIGHTING,
  MAX_WEAKNESS_IDS_CAP,
  MIN_SUBJECT_ATTEMPTS_FOR_STATS,
} from '../../common/constants/exam.constants.js';
import type { WeaknessIds } from './selection.types.js';

/**
 * Computes user weakness from answer history (Postgres).
 * Question-level weakness: wrong vs right balance.
 * Subject-level weakness: correctness rate with minimum sample size.
 */
@Injectable()
export class WeaknessService {
  private static readonly SUBJECT_PASS_RATE = 0.5;

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
      .getRawMany<{
        a_questionId: number;
        a_subject: number;
        a_correct: boolean;
      }>();

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
    type SubjectStat = { correct: number; wrong: number };
    type SubjectScore = { subject: number; total: number; correctnessRate: number };

    const bySubject = new Map<number, SubjectStat>();
    const byQuestion = new Map<number, number>();

    for (const r of rows) {
      const delta = r.a_correct ? -1 : 1;
      const subjectStat = bySubject.get(r.a_subject) ?? { correct: 0, wrong: 0 };
      if (r.a_correct) subjectStat.correct += 1;
      else subjectStat.wrong += 1;
      bySubject.set(r.a_subject, subjectStat);
      byQuestion.set(
        r.a_questionId,
        (byQuestion.get(r.a_questionId) ?? 0) + delta,
      );
    }

    const mistakeIds: number[] = [];
    const successIds: number[] = [];
    const mistakeSubjects: number[] = [];
    const successSubjects: number[] = [];

    for (const [id, n] of byQuestion) {
      if (n > 0) mistakeIds.push(id);
      else if (n < 0) successIds.push(id);
    }
    const eligibleSubjects: SubjectScore[] = [...bySubject.entries()]
      .map(([subject, stat]) => this.toSubjectScore(subject, stat))
      .filter(
        ({ total }) => total >= MIN_SUBJECT_ATTEMPTS_FOR_STATS,
      );

    // Sort once by weakness (lower correctness first), tie-break by sample size.
    const byWeakness = [...eligibleSubjects].sort((a, b) => {
      if (a.correctnessRate !== b.correctnessRate) {
        return a.correctnessRate - b.correctnessRate;
      }
      return b.total - a.total;
    });
    for (const item of byWeakness) {
      if (item.correctnessRate < WeaknessService.SUBJECT_PASS_RATE) {
        mistakeSubjects.push(item.subject);
      }
    }

    // Reuse the same ordering in reverse to rank strengths.
    for (let i = byWeakness.length - 1; i >= 0; i--) {
      const item = byWeakness[i];
      if (item.correctnessRate > WeaknessService.SUBJECT_PASS_RATE) {
        successSubjects.push(item.subject);
      }
    }

    return { mistakeIds, successIds, mistakeSubjects, successSubjects };
  }

  private toSubjectScore(
    subject: number,
    stat: { correct: number; wrong: number },
  ): { subject: number; total: number; correctnessRate: number } {
    const total = stat.correct + stat.wrong;
    const correctnessRate = total > 0 ? stat.correct / total : 0;
    return { subject, total, correctnessRate };
  }
}
