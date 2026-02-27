import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ExamAttempt } from './entities/exam-attempt.entity';
import { UserAnswer } from './entities/user-answer.entity';
import { Question, QuestionDocument } from '../questions/schemas/question.schema';
import { QuestionSelectionService, SelectionOptions } from './question-selection.service';
import { DEFAULT_LANG } from '../common/constants/lang.constants.js';
import {
  MAX_STATS_LIMIT,
  MAX_HISTORY_PAGE_SIZE,
  DEFAULT_HISTORY_PAGE_SIZE,
} from '../common/constants/exam.constants.js';
import type { StartAttemptOptions, AttemptSummary, PaginatedAttempts, RawAnswerRow } from './types/exam-attempts.types.js';

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
  ): Promise<{ attemptId: number; questions: unknown[] }> {
    const lang = options.lang ?? DEFAULT_LANG;
    const questionIds = await this.selectionService.selectQuestions({
      ...options,
      userId,
    });

    const attempt = this.attemptRepo.create({ userId, questionIds, lang });
    const saved = await this.attemptRepo.save(attempt);

    const questions = await this.questionModel
      .find({ id: { $in: questionIds }, lang })
      .lean()
      .exec();

    return { attemptId: saved.id, questions };
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

    return { correct };
  }

  async getHistory(
    userId: number,
    page = 1,
    size = DEFAULT_HISTORY_PAGE_SIZE,
  ): Promise<PaginatedAttempts> {
    const pageSize = Math.min(Math.max(1, size), MAX_HISTORY_PAGE_SIZE);
    const pageNum = Math.max(1, page);

    const [attempts, total] = await this.attemptRepo.findAndCount({
      where: { userId },
      relations: ['answers'],
      order: { createdAt: 'DESC' },
      skip: (pageNum - 1) * pageSize,
      take: pageSize,
    });

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
      completedAt: attempt.completedAt,
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
      completedAt: attempt.completedAt,
    };
  }
}
