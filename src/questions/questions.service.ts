import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Question, QuestionDocument } from './schemas/question.schema';

@Injectable()
export class QuestionsService {
  constructor(
    @InjectModel(Question.name) private questionModel: Model<QuestionDocument>,
  ) {}

  async findAll(options: {
    categories?: number[];
    subjects?: number[];
    random?: number;
    limit?: number;
  } = {}): Promise<Question[]> {
    const { categories, subjects, random, limit = 150 } = options;

    // Build match filter dynamically
    const match: Record<string, any> = {};

    if (categories?.length) {
      match.categories = { $in: categories };
    }

    if (subjects?.length) {
      match.subject = { $in: subjects };
    }

    // Build aggregation pipeline
    const pipeline: any[] = [];

    // Add $match stage if 2any filters exist
    if (Object.keys(match).length > 0) {
      pipeline.push({ $match: match });
    }

    // Add $sample for random selection, otherwise $limit
    if (random) {
      pipeline.push({ $sample: { size: random } });
    } else {
      pipeline.push({ $limit: limit });
    }

    return this.questionModel.aggregate(pipeline).exec();
  }

  async findOne(id: string): Promise<Question | null> {
    return this.questionModel.findById(id).exec();
  }

  async findBySubject(subject: number): Promise<Question[]> {
    return this.questionModel.find({ subject }).exec();
  }

  async findRandom(count: number = 10): Promise<Question[]> {
    return this.questionModel.aggregate([{ $sample: { size: count } }]).exec();
  }
}
