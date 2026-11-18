import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { OptionalQueryNumber } from '../../common/utils/query-number.util.js';
import {
  STUDY_DAY_PATTERN,
  STUDY_PLAN_MAX_DAYS,
  STUDY_PLAN_MIN_DAYS,
} from '../../common/constants/study-plan.constants.js';

/**
 * `?category=1&days=14` or `?category=1&examDay=2026-12-01`. One of `days`
 * / `examDay` is required (checked in the service: the exam date's range
 * depends on today). `examDay` wins when both are sent.
 */
export class PlanPreviewQueryDto {
  /** License category 0–9. Required: `?category=` is a 400, not AM. */
  @OptionalQueryNumber()
  @IsInt()
  @Min(0)
  @Max(9)
  category!: number;

  @OptionalQueryNumber()
  @IsOptional()
  @IsInt()
  @Min(STUDY_PLAN_MIN_DAYS)
  @Max(STUDY_PLAN_MAX_DAYS)
  days?: number;

  /** Exam study day `YYYY-MM-DD`. Empty means not given. */
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsOptional()
  @MaxLength(10)
  @Matches(STUDY_DAY_PATTERN)
  examDay?: string;
}
