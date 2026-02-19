import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Question, QuestionDocument } from './schemas/question.schema';

@Injectable()
export class QuestionsService {
  constructor(
    @InjectModel(Question.name) private questionModel: Model<QuestionDocument>,
  ) {}

  private buildMatch(lang: string, category?: number, subjects?: number[]) {
    const match: Record<string, any> = { lang };

    if (Number.isFinite(category)) {
      match.categories = category;
    }

    if (subjects?.length) {
      match.subject = { $in: subjects };
    }

    return match;
  }

  async findPaged(opts: {
    lang: string;
    category?: number;
    subjects?: number[];
    page: number;
    size: 10 | 20 | 40;
  }) {
    const { lang, category, subjects, page, size } = opts;
    const match = this.buildMatch(lang, category, subjects);
    const skip = (page - 1) * size;

    const pipeline: any[] = [{ $match: match }];

    pipeline.push({
      $facet: {
        items: [
          { $sort: { id: 1 } },
          { $skip: skip },
          { $limit: size },
          { $project: { lang: 0 } },
        ],
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
    lang: string;
    count: number;
    category?: number;
    subjects?: number[];
  }) {
    const { lang, count, category, subjects } = opts;
    const match = this.buildMatch(lang, category, subjects);

    const pipeline: any[] = [{ $match: match }];
    pipeline.push({ $sample: { size: count } });
    pipeline.push({ $project: { categories: 0, lang: 0 } });

    return this.questionModel.aggregate(pipeline).exec();
  }

  async findOne(id: string) {
    return this.questionModel.findById(id).lean().exec();
  }
}
