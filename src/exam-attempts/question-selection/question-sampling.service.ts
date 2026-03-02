import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { Question, QuestionDocument } from '../../questions/schemas/question.schema';
import type { SelectionRatios, WeaknessIds } from './selection.types.js';

export type MatchFilter = Record<string, unknown>;

/**
 * MongoDB sampling: random and weighted (mistakes + success).
 */
@Injectable()
export class QuestionSamplingService {
  constructor(
    @InjectModel(Question.name)
    private readonly questionModel: Model<QuestionDocument>,
  ) {}

  buildMatchFilter(
    lang: string,
    subjects?: number[],
    categories?: number[],
    allSubjects?: boolean,
  ): MatchFilter {
    const match: MatchFilter = { lang };
    if (categories?.length) match.categories = { $in: categories };
    if (!allSubjects && subjects?.length) match.subject = { $in: subjects };
    return match;
  }

  async sampleRandom(match: MatchFilter, limit: number, exclude: number[] = []): Promise<number[]> {
    const filter = exclude.length ? { ...match, id: { $nin: exclude } } : match;
    const docs = await this.questionModel
      .aggregate([
        { $match: filter },
        { $group: { _id: '$id' } },
        { $addFields: { r: { $rand: {} } } },
        { $sort: { r: 1 as 1 } },
        { $limit: limit },
        { $project: { id: '$_id', _id: 0 } },
      ])
      .exec();
    return docs.map((d: { id: number }) => d.id);
  }

  async sampleWeighted(
    match: MatchFilter,
    count: number,
    weakness: WeaknessIds,
    ratios: SelectionRatios,
  ): Promise<number[]> {
    const randomCount = Math.round(count * ratios.random);
    const mistakesCount = Math.round(count * ratios.mistakes);
    const successCount = count - randomCount - mistakesCount;

    const selectedIds = await this.sampleMistakesAndSuccess(
      match,
      weakness,
      mistakesCount,
      successCount,
    );
    const randomIds = await this.sampleRandom(match, randomCount, selectedIds);

    return [...selectedIds, ...randomIds];
  }

  private async sampleMistakesAndSuccess(
    match: MatchFilter,
    weakness: WeaknessIds,
    mistakesCount: number,
    successCount: number,
  ): Promise<number[]> {
    const { mistakeIds, successIds, mistakeSubjects, successSubjects } = weakness;

    const mistakeMatch = this.buildMistakeMatch(match, mistakeIds, mistakeSubjects);
    const successMatch = this.buildSuccessMatch(match, mistakeIds, successIds, successSubjects);

    const pipeline: Record<string, unknown>[] = [
      {
        $facet: {
          mistakes: [
            { $match: mistakeMatch },
            { $group: { _id: '$id' } },
            { $addFields: { r: { $rand: {} } } },
            { $sort: { r: 1 as 1 } },
            { $limit: mistakesCount },
          ],
          success: [
            { $match: successMatch },
            { $group: { _id: '$id' } },
            { $addFields: { r: { $rand: {} } } },
            { $sort: { r: 1 as 1 } },
            { $limit: successCount },
          ],
        },
      },
      {
        $addFields: {
          mistakeIds: { $map: { input: '$mistakes', as: 'm', in: '$$m._id' } },
          successIds: { $map: { input: '$success', as: 's', in: '$$s._id' } },
        },
      },
      { $addFields: { selectedIds: { $concatArrays: ['$mistakeIds', '$successIds'] } } },
      { $project: { selectedIds: 1 } },
    ];

    const [result] = await this.questionModel.aggregate(pipeline as unknown as PipelineStage[]).exec();
    return result?.selectedIds ?? [];
  }

  private buildMistakeMatch(
    match: MatchFilter,
    mistakeIds: number[],
    mistakeSubjects: number[],
  ): MatchFilter {
    const hasMistakes = mistakeIds.length > 0 || mistakeSubjects.length > 0;
    if (!hasMistakes) return { ...match, _id: null };

    const orConditions = [
      ...(mistakeIds.length ? [{ id: { $in: mistakeIds } }] : []),
      ...(mistakeSubjects.length ? [{ subject: { $in: mistakeSubjects } }] : []),
    ].filter(Boolean);

    return { $and: [match, { $or: orConditions }] } as MatchFilter;
  }

  private buildSuccessMatch(
    match: MatchFilter,
    mistakeIds: number[],
    successIds: number[],
    successSubjects: number[],
  ): MatchFilter {
    const hasSuccess = successIds.length > 0 || successSubjects.length > 0;
    if (!hasSuccess) return { ...match, _id: null };

    const andConditions: unknown[] = [match];
    if (mistakeIds.length) andConditions.push({ id: { $nin: mistakeIds } });

    const orConditions = [
      ...(successIds.length ? [{ id: { $in: successIds } }] : []),
      ...(successSubjects.length ? [{ subject: { $in: successSubjects } }] : []),
    ].filter(Boolean);
    andConditions.push({ $or: orConditions });

    return { $and: andConditions } as MatchFilter;
  }
}
