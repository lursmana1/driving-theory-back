import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateExamDto } from './dto/create-exam.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { Exam, ExamDocument } from './schemas/exam.schema';
import {
  Question,
  QuestionDocument,
} from '../questions/schemas/question.schema';

interface GenerateExamOptions {
  lang: string;
  title?: string;
  subjects?: number[];
  categories?: number[];
  count?: number;
  allSubjects?: boolean;
}

@Injectable()
export class ExamsService {
  constructor(
    @InjectModel(Exam.name)
    private readonly examModel: Model<ExamDocument>,
    @InjectModel(Question.name)
    private readonly questionModel: Model<QuestionDocument>,
  ) {}

  // Manual mode: if you ever want to pass explicit questionIds
  async create(createExamDto: CreateExamDto) {
    const { title, questionIds } = createExamDto as any;

    const exam = new this.examModel({
      title,
      questions: (questionIds ?? []).map(
        (id) => new Types.ObjectId(id as any),
      ),
    });

    return exam.save();
  }

  // Generate exam by random/subject/category, no direct questionIds needed
  async generateExam(options: GenerateExamOptions) {
    const {
      lang,
      title,
      subjects,
      categories,
      count = 30,
      allSubjects,
    } = options;

    const match: Record<string, any> = { lang };

    if (categories?.length) {
      match.categories = { $in: categories };
    }

    if (!allSubjects && subjects?.length) {
      match.subject = { $in: subjects };
    }

    const pipeline: any[] = [{ $match: match }];

    pipeline.push({ $sample: { size: count } });

    const questions = await this.questionModel.aggregate(pipeline).exec();

    const exam = new this.examModel({
      title: title ?? 'Generated exam',
      questions: questions.map((q: any) => new Types.ObjectId(q._id)),
    });

    const saved = await exam.save();
    return saved.populate('questions');
  }

  async findAll() {
    return this.examModel.find().populate('questions').exec();
  }

  async findOne(id: string) {
    const exam = await this.examModel
      .findById(id)
      .populate('questions')
      .exec();

    if (!exam) {
      throw new NotFoundException(`Exam with id "${id}" not found`);
    }

    return exam;
  }

  async update(id: string, updateExamDto: UpdateExamDto) {
    const { title, questionIds } = updateExamDto as any;

    const update: Partial<Exam> & { questions?: Types.ObjectId[] } = {};

    if (typeof title === 'string') {
      update.title = title;
    }

    if (questionIds) {
      update.questions = questionIds.map(
        (qid) => new Types.ObjectId(qid as any),
      );
    }

    const exam = await this.examModel
      .findByIdAndUpdate(id, update, { new: true })
      .populate('questions')
      .exec();

    if (!exam) {
      throw new NotFoundException(`Exam with id "${id}" not found`);
    }

    return exam;
  }

  async remove(id: string) {
    const res = await this.examModel.findByIdAndDelete(id).exec();

    if (!res) {
      throw new NotFoundException(`Exam with id "${id}" not found`);
    }

    return { deleted: true };
  }
}
