import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserAnswer } from './entities/user-answer.entity';
import { Question, QuestionDocument } from '../questions/schemas/question.schema';
import {
  MIN_WRONG_ANSWERS_FOR_STATS,
  DEFAULT_QUESTION_COUNT,
  MAX_HISTORY_FOR_WEIGHTING,
  MAX_CANDIDATE_SAMPLE_SIZE,
} from '../common/constants/exam.constants.js';
import { DEFAULT_LANG } from '../common/constants/lang.constants.js';

export interface SelectionOptions {
  userId: number;
  lang: string;
  count?: number;
  subjects?: number[];
  categories?: number[];
  allSubjects?: boolean;
}

interface NetWeakness {
  bySubject: Map<number, number>;
  byQuestion: Map<number, number>;
}

@Injectable()
export class QuestionSelectionService {
  constructor(
    @InjectRepository(UserAnswer)
    private readonly userAnswerRepo: Repository<UserAnswer>,
    @InjectModel(Question.name)
    private readonly questionModel: Model<QuestionDocument>,
  ) {}

  async selectQuestions(options: SelectionOptions): Promise<number[]> {
    const count = options.count ?? DEFAULT_QUESTION_COUNT;
    const lang = options.lang ?? DEFAULT_LANG;

    const match = this.buildMatchFilter(lang, options.subjects, options.categories, options.allSubjects);

    const wrongCount = await this.userAnswerRepo.count({
      where: { correct: false, attempt: { userId: options.userId } },
    });

    if (wrongCount < MIN_WRONG_ANSWERS_FOR_STATS) {
      return this.selectRandom(match, count);
    }

    const weakness = await this.computeNetWeakness(options.userId);
    return this.selectWithWeighting(match, count, weakness);
  }

  private buildMatchFilter(
    lang: string,
    subjects?: number[],
    categories?: number[],
    allSubjects?: boolean,
  ): Record<string, unknown> {
    const match: Record<string, unknown> = { lang };
    if (categories?.length) {
      match.categories = { $in: categories };
    }
    if (!allSubjects && subjects?.length) {
      match.subject = { $in: subjects };
    }
    return match;
  }

  private async selectRandom(match: Record<string, unknown>, count: number): Promise<number[]> {
    const pipeline = [
      { $match: match },
      { $sample: { size: count } },
      { $project: { id: 1 } },
    ];
    const questions = await this.questionModel.aggregate(pipeline).exec();
    return questions.map((q: { id: number }) => q.id);
  }

  private async computeNetWeakness(userId: number): Promise<NetWeakness> {
    const history = await this.userAnswerRepo.find({
      where: { attempt: { userId } },
      relations: ['attempt'],
      order: { createdAt: 'DESC' },
      take: MAX_HISTORY_FOR_WEIGHTING,
    });

    const bySubject = new Map<number, number>();
    const byQuestion = new Map<number, number>();

    for (const a of history) {
      const delta = a.correct ? -1 : 1;
      bySubject.set(a.subject, (bySubject.get(a.subject) ?? 0) + delta);
      byQuestion.set(a.questionId, (byQuestion.get(a.questionId) ?? 0) + delta);
    }

    return { bySubject, byQuestion };
  }

  private async selectWithWeighting(
    match: Record<string, unknown>,
    count: number,
    weakness: NetWeakness,
  ): Promise<number[]> {
    const sampleSize = Math.min(count * 3, MAX_CANDIDATE_SAMPLE_SIZE);
    const pipeline = [
      { $match: match },
      { $sample: { size: sampleSize } },
      { $project: { id: 1, subject: 1 } },
    ];

    const candidates = await this.questionModel.aggregate(pipeline).exec();

    if (candidates.length <= count) {
      return candidates.map((q: { id: number }) => q.id);
    }

    const scored = candidates.map((q: { id: number; subject: number }) => {
      const subWeak = Math.max(0, weakness.bySubject.get(q.subject) ?? 0);
      const qWeak = Math.max(0, weakness.byQuestion.get(q.id) ?? 0);
      const score = subWeak * 2 + qWeak * 3 + Math.random() * 0.5;
      return { id: q.id, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, count).map((x) => x.id);
  }
}
