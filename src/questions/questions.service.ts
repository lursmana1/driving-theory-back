import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Question, QuestionDocument } from './schemas/question.schema';

@Injectable()
export class QuestionsService {
  constructor(
    @InjectModel(Question.name) private questionModel: Model<QuestionDocument>,
  ) {}

  private buildMatch(category?: number, subjects?: number[]) {
    const match: Record<string, any> = {};

    if (Number.isFinite(category)) {
      match.categories = category;
    }

    if (subjects?.length) {
      match.subject = { $in: subjects };
    }

    return match;
  }

  async findPaged(opts: {
    category?: number;
    subjects?: number[];
    page: number;
    size: 10 | 20 | 40;
  }) {
    const { category, subjects, page, size } = opts;
    const match = this.buildMatch(category, subjects);
    const skip = (page - 1) * size;

    const pipeline: any[] = [];
    if (Object.keys(match).length) pipeline.push({ $match: match });

    pipeline.push({
      $facet: {
        items: [{ $sort: { id: 1 } }, { $skip: skip }, { $limit: size }],
        meta: [{ $count: 'total' }],
      },
    });

    const [res] = await this.questionModel.aggregate(pipeline).exec();
    const total = res?.meta?.[0]?.total ?? 0;

    return {
      items: res?.items ?? [],
      page,
      size,
      total,
      totalPages: Math.ceil(total / size),
    };
  }

  async findRandom(opts: {
    count: number;
    category?: number;
    subjects?: number[];
  }) {
    const { count, category, subjects } = opts;
    const match = this.buildMatch(category, subjects);

    const pipeline: any[] = [];
    if (Object.keys(match).length) pipeline.push({ $match: match });
    pipeline.push({ $sample: { size: count } });

    return this.questionModel.aggregate(pipeline).exec();
  }

  async findOne(id: string) {
    return this.questionModel.findById(id).lean().exec();
  }
}
