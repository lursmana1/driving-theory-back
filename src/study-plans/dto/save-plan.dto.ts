import {
  IsInt,
  IsObject,
  IsOptional,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  STUDY_DAY_PATTERN,
  STUDY_PLAN_MAX_DAYS,
  STUDY_PLAN_MIN_DAYS,
} from '../../common/constants/study-plan.constants.js';

/**
 * PUT /study-plans/me: the whole saved plan (choice + progress). `done` and
 * `tests` are checked in depth by `parsePlanProgress` (keys, dates, scores).
 */
export class SavePlanDto {
  @IsInt()
  @Min(0)
  @Max(9)
  categoryId!: number;

  @IsInt()
  @Min(STUDY_PLAN_MIN_DAYS)
  @Max(STUDY_PLAN_MAX_DAYS)
  dayCount!: number;

  @MaxLength(10)
  @Matches(STUDY_DAY_PATTERN)
  startDay!: string;

  /** `@IsOptional` skips both null and undefined. */
  @IsOptional()
  @MaxLength(10)
  @Matches(STUDY_DAY_PATTERN)
  examDay?: string | null;

  @IsObject()
  done!: Record<string, unknown>;

  @IsObject()
  tests!: Record<string, unknown>;
}
