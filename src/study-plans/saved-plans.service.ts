import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parsePgInt } from '../common/utils/pg-row.util.js';
import { StudyPlan } from './entities/study-plan.entity.js';
import { parsePlanProgress } from './progress.util.js';
import { planWriteQuery } from './saved-plans.sql.js';
import { isStudyDay } from './schedule/plan-length.util.js';
import type { SavePlanDto } from './dto/save-plan.dto.js';
import type { SavedStudyPlanView } from './study-plans.types.js';

type PlanFields = Pick<
  StudyPlan,
  | 'categoryId'
  | 'dayCount'
  | 'startDay'
  | 'examDay'
  | 'progress'
  | 'revision'
  | 'updatedAt'
>;

type RevisionRow = { revision: number | string };

function toView(row: PlanFields): SavedStudyPlanView {
  return {
    categoryId: row.categoryId,
    dayCount: row.dayCount,
    startDay: row.startDay,
    examDay: row.examDay,
    done: row.progress?.done ?? {},
    tests: row.progress?.tests ?? {},
    mistakes: row.progress?.mistakes ?? {},
    revision: row.revision,
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

  /**
   * One atomic statement. With `baseRevision` the write happens only on the
   * version the client read; otherwise 409 carrying the current plan (null
   * when it was deleted), so the client can re-apply its changes on top
   * without another GET. Without it: create or replace, last write wins.
   */
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

    const updatedAt = new Date();
    const { sql, params } = planWriteQuery(
      {
        userId,
        categoryId: dto.categoryId,
        dayCount: dto.dayCount,
        startDay: dto.startDay,
        examDay,
        progress,
        updatedAt,
      },
      dto.baseRevision,
    );
    const rows = await this.plans.query<RevisionRow[]>(sql, params);
    if (rows.length === 0) {
      const current = await this.plans.findOne({ where: { userId } });
      throw new ConflictException({
        message: 'Study plan changed',
        plan: current ? toView(current) : null,
      });
    }
    return toView({
      categoryId: dto.categoryId,
      dayCount: dto.dayCount,
      startDay: dto.startDay,
      examDay,
      progress,
      revision: parsePgInt(rows[0].revision),
      updatedAt,
    });
  }

  async deleteMine(userId: number): Promise<void> {
    await this.plans.delete({ userId });
  }
}
