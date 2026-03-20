import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectModel } from '@nestjs/mongoose';
import { Repository } from 'typeorm';
import { Model } from 'mongoose';
import { UserAnswer } from '../exam-attempts/entities/user-answer.entity';
import { Question, QuestionDocument } from '../questions/schemas/question.schema';
import { DEFAULT_LANG } from '../common/constants/lang.constants.js';

const TOP_COUNT = 10;

export interface WeakQuestionItem {
  questionId: number;
  wrongCount: number;
  question: unknown;
}

export interface WeakSubjectItem {
  subjectId: number;
  wrongCount: number;
  correctCount: number;
  totalQuestions: number;
}

export interface WeakQuestionsResponse {
  data: WeakQuestionItem[];
  total: number;
}

export interface WeakSubjectsResponse {
  data: WeakSubjectItem[];
  total: number;
}

@Injectable()
export class UserStatsService {
  constructor(
    @InjectRepository(UserAnswer)
    private readonly answerRepo: Repository<UserAnswer>,
    @InjectModel(Question.name)
    private readonly questionModel: Model<QuestionDocument>,
  ) {}

  async getWeakQuestions(
    userId: number,
    lang: string = DEFAULT_LANG,
  ): Promise<WeakQuestionsResponse> {
    const baseQb = this.answerRepo
      .createQueryBuilder('a')
      .innerJoin('a.attempt', 't')
      .where('t.userId = :userId', { userId })
      .andWhere('a.correct = :correct', { correct: false })
      .select('a.questionId', 'questionId')
      .addSelect('COUNT(*)', 'wrongCount')
      .groupBy('a.questionId')
      .orderBy('wrongCount', 'DESC');

    const [rows, countResult] = await Promise.all([
      baseQb.clone().limit(TOP_COUNT).getRawMany<{ questionId: string; wrongCount: string }>(),
      this.answerRepo
        .createQueryBuilder('a')
        .innerJoin('a.attempt', 't')
        .where('t.userId = :userId', { userId })
        .andWhere('a.correct = :correct', { correct: false })
        .select('COUNT(DISTINCT a.questionId)', 'cnt')
        .getRawOne<{ cnt: string }>(),
    ]);

    const total = Number(countResult?.cnt ?? 0);
    const questionIds = rows.map((r) => Number(r.questionId));
    const questions = await this.questionModel
      .find({ id: { $in: questionIds }, lang })
      .lean()
      .exec();
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    return {
      data: rows.map((r) => ({
        questionId: Number(r.questionId),
        wrongCount: Number(r.wrongCount),
        question: questionMap.get(Number(r.questionId)) ?? null,
      })),
      total,
    };
  }

  async getWeakSubjects(
    userId: number,
    lang: string = DEFAULT_LANG,
  ): Promise<WeakSubjectsResponse> {
    const rawRows = await this.answerRepo.manager.query<
      { subjectId: number; correct: boolean }[]
    >(
      `
      SELECT a.subject AS subjectId, a.correct
      FROM user_answers a
      INNER JOIN exam_attempts t ON a.attemptId = t.id
      INNER JOIN (
        SELECT a2.questionId, MAX(a2.id) AS latestId
        FROM user_answers a2
        INNER JOIN exam_attempts t2 ON a2.attemptId = t2.id
        WHERE t2.userId = ?
        GROUP BY a2.questionId
      ) latest ON a.questionId = latest.questionId AND a.id = latest.latestId
      WHERE t.userId = ?
      `,
      [userId, userId],
    );

    const bySubject = new Map<
      number,
      { wrongCount: number; correctCount: number }
    >();
    for (const r of rawRows) {
      const sub = Number(r.subjectId);
      const curr = bySubject.get(sub) ?? {
        wrongCount: 0,
        correctCount: 0,
      };
      if (r.correct) {
        curr.correctCount += 1;
      } else {
        curr.wrongCount += 1;
      }
      bySubject.set(sub, curr);
    }

    const sorted = [...bySubject.entries()]
      .filter(([, v]) => v.wrongCount > 0)
      .sort((a, b) => b[1].wrongCount - a[1].wrongCount);

    const total = sorted.length;
    const topRows = sorted.slice(0, TOP_COUNT);
    const subjectIds = topRows.map(([id]) => id);
    const totalBySubject = await this.questionModel
      .aggregate<{ _id: number; count: number }>([
        { $match: { subject: { $in: subjectIds }, lang } },
        { $group: { _id: '$subject', count: { $sum: 1 } } },
      ])
      .exec();
    const totalMap = new Map(
      totalBySubject.map((x) => [x._id, x.count]),
    );

    return {
      data: topRows.map(([subjectId, counts]) => ({
        subjectId,
        wrongCount: counts.wrongCount,
        correctCount: counts.correctCount,
        totalQuestions: totalMap.get(subjectId) ?? 0,
      })),
      total,
    };
  }
}
