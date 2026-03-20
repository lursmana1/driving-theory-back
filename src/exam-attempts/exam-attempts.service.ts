import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ExamAttempt } from './entities/exam-attempt.entity';
import { UserAnswer } from './entities/user-answer.entity';
import { Question, QuestionDocument } from '../questions/schemas/question.schema';
import { QuestionSelectionService } from './question-selection/question-selection.service';
import { DEFAULT_LANG } from '../common/constants/lang.constants.js';
import {
  MAX_STATS_LIMIT,
  MAX_HISTORY_PAGE_SIZE,
  DEFAULT_HISTORY_PAGE_SIZE,
  EXAM_DURATION_MINUTES,
  EXAM_PASS_PERCENT,
} from '../common/constants/exam.constants.js';
import type {
  StartAttemptOptions,
  AttemptSummary,
  PaginatedAttempts,
  RawAnswerRow,
} from './types/exam-attempts.types.js';

@Injectable()
export class ExamAttemptsService {
  constructor(
    @InjectRepository(ExamAttempt)
    private readonly attemptRepo: Repository<ExamAttempt>,
    @InjectRepository(UserAnswer)
    private readonly answerRepo: Repository<UserAnswer>,
    @InjectModel(Question.name)
    private readonly questionModel: Model<QuestionDocument>,
    private readonly selectionService: QuestionSelectionService,
  ) {}

  async startAttempt(
    userId: number,
    options: StartAttemptOptions,
  ): Promise<{ attemptId: number; endDate: Date; questions: unknown[] }> {
    const lang = options.lang ?? DEFAULT_LANG;
    const questionIds = await this.selectionService.selectQuestions({
      ...options,
      userId,
    });

    const attempt = this.attemptRepo.create({
      userId,
      questionIds,
      lang,
    });
    const saved = await this.attemptRepo.save(attempt);

    const endDate = new Date(
      saved.createdAt.getTime() + EXAM_DURATION_MINUTES * 60 * 1000,
    );
    await this.attemptRepo.update(saved.id, { endDate });

    const questions = await this.questionModel
      .find({ id: { $in: questionIds }, lang })
      .lean()
      .exec();

    return { attemptId: saved.id, endDate, questions };
  }

  async submitAnswer(
    userId: number,
    attemptId: number,
    questionId: number,
    chosenAnswer: string,
  ): Promise<{ correct: boolean }> {
    const attempt = await this.findAttemptForUser(attemptId, userId);

    this.validateQuestionInAttempt(attempt, questionId);

    const question = await this.questionModel
      .findOne({ id: questionId, lang: attempt.lang })
      .lean()
      .exec();

    if (!question) {
      throw new NotFoundException('Question not found');
    }

    const correct = question.correct_answer === chosenAnswer;

    await this.answerRepo.save(
      this.answerRepo.create({
        attemptId,
        questionId,
        subject: question.subject,
        correct,
        chosenAnswer,
      }),
    );

    const updatedAttempt = await this.findAttemptForUser(attemptId, userId);
    const allAnswered =
      updatedAttempt.answers.length >= updatedAttempt.questionIds.length;
    if (allAnswered && !updatedAttempt.completedAt) {
      const correctCount = updatedAttempt.answers.filter((a) => a.correct).length;
      const passed = correctCount / updatedAttempt.questionIds.length >= EXAM_PASS_PERCENT;
      const completedAt = new Date();
      const durationSeconds = Math.round(
        (completedAt.getTime() - updatedAttempt.createdAt.getTime()) / 1000,
      );
      await this.attemptRepo.update(attemptId, {
        completedAt,
        passed,
        durationSeconds,
      });
    }

    return { correct };
  }

  async finishAttempt(
    userId: number,
    attemptId: number,
  ): Promise<{ completedAt: Date; passed: boolean; durationSeconds: number }> {
    const attempt = await this.findAttemptForUser(attemptId, userId);
    if (attempt.completedAt) {
      return {
        completedAt: attempt.completedAt,
        passed: attempt.passed ?? false,
        durationSeconds: attempt.durationSeconds ?? 0,
      };
    }

    const correctCount = attempt.answers.filter((a) => a.correct).length;
    const total = attempt.questionIds.length;
    const passed = total > 0 && correctCount / total >= EXAM_PASS_PERCENT;
    const completedAt = new Date();
    const durationSeconds = Math.round(
      (completedAt.getTime() - attempt.createdAt.getTime()) / 1000,
    );
    await this.attemptRepo.update(attemptId, {
      completedAt,
      passed,
      durationSeconds,
    });

    return { completedAt, passed, durationSeconds };
  }

  async getHistory(
    userId: number,
    page = 1,
    size = DEFAULT_HISTORY_PAGE_SIZE,
  ): Promise<PaginatedAttempts> {
    const pageSize = Math.min(Math.max(1, size), MAX_HISTORY_PAGE_SIZE);
    const pageNum = Math.max(1, page);

    const qb = this.attemptRepo
      .createQueryBuilder('e')
      .where('e.userId = :userId', { userId })
      .andWhere(
        'EXISTS (SELECT 1 FROM user_answers ua WHERE ua.attemptId = e.id)',
      )
      .orderBy('e.createdAt', 'DESC')
      .skip((pageNum - 1) * pageSize)
      .take(pageSize)
      .leftJoinAndSelect('e.answers', 'answers');

    const [attempts, total] = await qb.getManyAndCount();

    return {
      data: attempts.map((a) => this.toAttemptSummary(a)),
      total,
      page: pageNum,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getAttempt(userId: number, attemptId: number) {
    const attempt = await this.findAttemptForUser(attemptId, userId);

    const questions = await this.questionModel
      .find({ id: { $in: attempt.questionIds }, lang: attempt.lang })
      .lean()
      .exec();

    return {
      id: attempt.id,
      questionIds: attempt.questionIds,
      questions,
      answers: attempt.answers,
      createdAt: attempt.createdAt,
      endDate: attempt.endDate,
      completedAt: attempt.completedAt,
      passed: attempt.passed,
      durationSeconds: attempt.durationSeconds,
    };
  }

  async getRawAnswers(userId: number, limit = MAX_STATS_LIMIT): Promise<RawAnswerRow[]> {
    const answers = await this.answerRepo.find({
      where: { attempt: { userId } },
      relations: ['attempt'],
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return answers.map((a) => ({
      questionId: a.questionId,
      subject: a.subject,
      correct: a.correct,
      chosenAnswer: a.chosenAnswer,
      createdAt: a.createdAt,
    }));
  }

  private async findAttemptForUser(attemptId: number, userId: number): Promise<ExamAttempt> {
    const attempt = await this.attemptRepo.findOne({
      where: { id: attemptId, userId },
      relations: ['answers'],
    });
    if (!attempt) {
      throw new NotFoundException('Attempt not found');
    }
    return attempt;
  }

  private validateQuestionInAttempt(attempt: ExamAttempt, questionId: number): void {
    if (!attempt.questionIds.includes(questionId)) {
      throw new ForbiddenException('Question not in this attempt');
    }
    if (attempt.answers.some((a) => a.questionId === questionId)) {
      throw new ForbiddenException('Already answered this question');
    }
  }

  private toAttemptSummary(attempt: ExamAttempt): AttemptSummary {
    return {
      id: attempt.id,
      questionCount: attempt.questionIds.length,
      answeredCount: attempt.answers.length,
      correctCount: attempt.answers.filter((x) => x.correct).length,
      createdAt: attempt.createdAt,
      endDate: attempt.endDate,
      completedAt: attempt.completedAt,
      passed: attempt.passed,
      durationSeconds: attempt.durationSeconds,
    };
  }
}
