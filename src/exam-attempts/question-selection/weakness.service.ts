import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAnswer } from '../entities/user-answer.entity';
import { PracticeAnswer } from '../../practice-answers/entities/practice-answer.entity';
import {
  MAX_HISTORY_FOR_WEIGHTING,
  MAX_WEAKNESS_IDS_CAP,
  MIN_SUBJECT_ATTEMPTS_FOR_STATS,
} from '../../common/constants/exam.constants.js';
import { parsePgBoolean, parsePgInt } from '../../common/utils/pg-row.util.js';
import type { WeaknessIds } from './selection.types.js';

type HistoryRawRow = {
  a_questionId: number | string;
  a_subject: number | string | null;
  a_correct: boolean | string | null;
  a_createdAt: Date | string;
};

type HistoryRow = {
  a_questionId: number;
  a_subject: number;
  a_correct: boolean;
  a_createdAt: Date | string;
};

type SubjectStat = { correct: number; wrong: number };
type SubjectScore = {
  subject: number;
  total: number;
  correctnessRate: number;
};

/**
 * TypeORM `innerJoin` ON clause. Property names, not quoted SQL columns —
 * different from `liveQuestionJoinSql`.
 */
function liveQuestionOn(answerAlias: string, langAlias: string): string {
  return `lq.id = ${answerAlias}.questionId AND lq.lang = ${langAlias}.lang`;
}

/**
 * Computes user weakness from answer history (Postgres).
 * Includes timed-exam answers + graded practice_answers (tickets/trainer).
 * Question-level: net wrong−right balance in recent history.
 * Subject-level: correctness rate vs SUBJECT_PASS_RATE (0.5) with min sample.
 * (Profile subject cards use QUESTION_MASTERY_CORRECT_RATIO 0.6 — different product surface.)
 */
@Injectable()
export class WeaknessService {
  private static readonly SUBJECT_PASS_RATE = 0.5;

  constructor(
    @InjectRepository(UserAnswer)
    private readonly userAnswerRepo: Repository<UserAnswer>,
    @InjectRepository(PracticeAnswer)
    private readonly practiceRepo: Repository<PracticeAnswer>,
  ) {}

  async getTotalAnswerCount(userId: number): Promise<number> {
    const [examCount, practiceCount] = await Promise.all([
      this.userAnswerRepo
        .createQueryBuilder('a')
        .innerJoin('a.attempt', 't')
        .innerJoin('questions', 'lq', liveQuestionOn('a', 't'))
        .where('t.userId = :userId', { userId })
        .getCount(),
      this.practiceRepo
        .createQueryBuilder('p')
        .innerJoin('questions', 'lq', liveQuestionOn('p', 'p'))
        .where('p.userId = :userId', { userId })
        .andWhere('p.correct IS NOT NULL')
        .getCount(),
    ]);
    return examCount + practiceCount;
  }

  async getWeaknessIds(userId: number): Promise<WeaknessIds> {
    const half = Math.ceil(MAX_HISTORY_FOR_WEIGHTING / 2);
    const [examRows, practiceRows] = await Promise.all([
      this.fetchExamAnswerRows(userId, half),
      this.fetchPracticeAnswerRows(userId, half),
    ]);
    const scored = this.computeWeaknessFromRows(
      this.mergeHistoryRows(examRows, practiceRows),
    );

    return {
      mistakeIds: scored.mistakeIds.slice(0, MAX_WEAKNESS_IDS_CAP),
      successIds: scored.successIds.slice(0, MAX_WEAKNESS_IDS_CAP),
      mistakeSubjects: scored.mistakeSubjects.slice(0, MAX_WEAKNESS_IDS_CAP),
      successSubjects: scored.successSubjects.slice(0, MAX_WEAKNESS_IDS_CAP),
    };
  }

  private fetchExamAnswerRows(
    userId: number,
    limit: number,
  ): Promise<HistoryRawRow[]> {
    return this.userAnswerRepo
      .createQueryBuilder('a')
      .innerJoin('a.attempt', 't')
      .innerJoin('questions', 'lq', liveQuestionOn('a', 't'))
      .where('t.userId = :userId', { userId })
      .select(['a.questionId', 'a.subject', 'a.correct', 'a.createdAt'])
      .orderBy('a.createdAt', 'DESC')
      .limit(limit)
      .getRawMany<HistoryRawRow>();
  }

  private fetchPracticeAnswerRows(
    userId: number,
    limit: number,
  ): Promise<HistoryRawRow[]> {
    return this.practiceRepo
      .createQueryBuilder('p')
      .innerJoin('questions', 'lq', liveQuestionOn('p', 'p'))
      .where('p.userId = :userId', { userId })
      .andWhere('p.correct IS NOT NULL')
      .select('p.questionId', 'a_questionId')
      .addSelect('COALESCE(p.subject, lq.subject)', 'a_subject')
      .addSelect('p.correct', 'a_correct')
      .addSelect('p.updatedAt', 'a_createdAt')
      .orderBy('p.updatedAt', 'DESC')
      .limit(limit)
      .getRawMany<HistoryRawRow>();
  }

  private mergeHistoryRows(
    examRows: HistoryRawRow[],
    practiceRows: HistoryRawRow[],
  ): HistoryRow[] {
    return [...examRows, ...practiceRows]
      .filter((r) => r.a_subject != null && r.a_correct != null)
      .map((r) => ({
        a_questionId: parsePgInt(r.a_questionId),
        a_subject: parsePgInt(r.a_subject),
        a_correct: parsePgBoolean(r.a_correct),
        a_createdAt: r.a_createdAt,
      }))
      .sort(
        (a, b) =>
          new Date(b.a_createdAt).getTime() - new Date(a.a_createdAt).getTime(),
      )
      .slice(0, MAX_HISTORY_FOR_WEIGHTING);
  }

  private computeWeaknessFromRows(rows: HistoryRow[]): WeaknessIds {
    const bySubject = new Map<number, SubjectStat>();
    const byQuestion = new Map<number, number>();

    for (const r of rows) {
      const delta = r.a_correct ? -1 : 1;
      const subjectStat = bySubject.get(r.a_subject) ?? {
        correct: 0,
        wrong: 0,
      };
      if (r.a_correct) subjectStat.correct += 1;
      else subjectStat.wrong += 1;
      bySubject.set(r.a_subject, subjectStat);
      byQuestion.set(
        r.a_questionId,
        (byQuestion.get(r.a_questionId) ?? 0) + delta,
      );
    }

    return {
      ...this.scoreQuestionsByNet(byQuestion),
      ...this.scoreSubjectsByRate(bySubject),
    };
  }

  /** Wrong answers add 1, right answers subtract 1. Zero nets are neither. */
  private scoreQuestionsByNet(byQuestion: Map<number, number>): {
    mistakeIds: number[];
    successIds: number[];
  } {
    const mistakeIds: number[] = [];
    const successIds: number[] = [];
    for (const [id, n] of byQuestion) {
      if (n > 0) mistakeIds.push(id);
      else if (n < 0) successIds.push(id);
    }
    return { mistakeIds, successIds };
  }

  /**
   * Subjects need MIN_SUBJECT_ATTEMPTS_FOR_STATS answers. Below 0.5 is a
   * mistake topic; above 0.5 is a success topic. Ties on rate prefer the
   * larger sample, and success topics are listed strongest first.
   */
  private scoreSubjectsByRate(bySubject: Map<number, SubjectStat>): {
    mistakeSubjects: number[];
    successSubjects: number[];
  } {
    const eligibleSubjects = [...bySubject.entries()]
      .map(([subject, stat]) => this.toSubjectScore(subject, stat))
      .filter(({ total }) => total >= MIN_SUBJECT_ATTEMPTS_FOR_STATS);

    const byWeakness = [...eligibleSubjects].sort((a, b) => {
      if (a.correctnessRate !== b.correctnessRate) {
        return a.correctnessRate - b.correctnessRate;
      }
      return b.total - a.total;
    });

    const mistakeSubjects: number[] = [];
    for (const item of byWeakness) {
      if (item.correctnessRate < WeaknessService.SUBJECT_PASS_RATE) {
        mistakeSubjects.push(item.subject);
      }
    }

    const successSubjects: number[] = [];
    for (let i = byWeakness.length - 1; i >= 0; i--) {
      const item = byWeakness[i];
      if (item.correctnessRate > WeaknessService.SUBJECT_PASS_RATE) {
        successSubjects.push(item.subject);
      }
    }

    return { mistakeSubjects, successSubjects };
  }

  private toSubjectScore(subject: number, stat: SubjectStat): SubjectScore {
    const total = stat.correct + stat.wrong;
    const correctnessRate = total > 0 ? stat.correct / total : 0;
    return { subject, total, correctnessRate };
  }
}
