import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudyPlan } from './entities/study-plan.entity.js';
import { parsePlanProgress } from './progress.util.js';
import { isStudyDay } from './schedule/plan-length.util.js';
import type { SavePlanDto } from './dto/save-plan.dto.js';
import type { SavedStudyPlanView } from './study-plans.types.js';

type PlanFields = Pick<
  StudyPlan,
  'categoryId' | 'dayCount' | 'startDay' | 'examDay' | 'progress' | 'updatedAt'
>;

function toView(row: PlanFields): SavedStudyPlanView {
  return {
    categoryId: row.categoryId,
    dayCount: row.dayCount,
    startDay: row.startDay,
    examDay: row.examDay,
    done: row.progress?.done ?? {},
    tests: row.progress?.tests ?? {},
    mistakes: row.progress?.mistakes ?? {},
    updatedAt: row.updatedAt,
  };
}

/**
 * Signed-in users' saved plan (MVP: one per user, the client owns the
 * progress and sends the whole plan). Every query is keyed by the caller's
 * own userId from the JWT.
 */
@Injectable()
export class SavedPlansService {
  constructor(
    @InjectRepository(StudyPlan)
    private readonly plans: Repository<StudyPlan>,
  ) {}

  async getMine(userId: number): Promise<SavedStudyPlanView> {
    const row = await this.plans.findOne({ where: { userId } });
    if (!row) throw new NotFoundException('No study plan');
    return toView(row);
  }

  async saveMine(
    userId: number,
    dto: SavePlanDto,
  ): Promise<SavedStudyPlanView> {
    if (!isStudyDay(dto.startDay)) {
      throw new BadRequestException('startDay is not a valid date');
    }
    const examDay = dto.examDay ?? null;
    if (examDay && !isStudyDay(examDay)) {
      throw new BadRequestException('examDay is not a valid date');
    }
    const progress = parsePlanProgress(dto, dto.dayCount);
    if (!progress) throw new BadRequestException('Invalid plan progress');

    const fields: PlanFields = {
      categoryId: dto.categoryId,
      dayCount: dto.dayCount,
      startDay: dto.startDay,
      examDay,
      progress,
      updatedAt: new Date(),
    };
    // createdAt is left out so an update keeps the first value (DB default
    // on insert). One atomic statement: a second tab saving at once wins
    // last. Every returned field is the one just written, so no re-read.
    await this.plans.upsert(
      { userId, ...fields },
      { conflictPaths: ['userId'] },
    );
    return toView(fields);
  }

  async deleteMine(userId: number): Promise<void> {
    await this.plans.delete({ userId });
  }
}
