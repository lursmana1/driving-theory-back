import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { OptionalQueryNumber } from '../../common/utils/query-number.util.js';
import {
  TRAINER_MAX_SUBJECT_FILTER,
  TRAINER_SESSION_MAX_LIMIT,
} from '../../common/constants/question-progress.constants.js';

/** Highest subject id accepted in a filter (ids are small catalog ints). */
const MAX_SUBJECT_ID = 10_000;

/**
 * `?subjects=1,2,3` or `?subjects=1&subjects=2,3` → `[1, 2, 3]`. Empty
 * segments are dropped (`1,` → `[1]`); nothing left means no filter.
 */
function toIdList({ value }: { value: unknown }): unknown {
  if (value == null) return undefined;
  const parts = Array.isArray(value) ? value : [value];
  if (!parts.every((part) => typeof part === 'string')) return value;
  const ids = parts
    .flatMap((part) => part.split(','))
    .map((part) => part.trim())
    .filter((part) => part !== '');
  return ids.length ? ids.map(Number) : undefined;
}

export class TrainerSummaryQueryDto {
  /** License category 0–9. Required: `?category=` is a 400, not AM. */
  @OptionalQueryNumber()
  @IsInt()
  @Min(0)
  @Max(9)
  category!: number;
}

export class TrainerSessionQueryDto extends TrainerSummaryQueryDto {
  @Transform(toIdList)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TRAINER_MAX_SUBJECT_FILTER)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(MAX_SUBJECT_ID, { each: true })
  subjects?: number[];

  @OptionalQueryNumber()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(TRAINER_SESSION_MAX_LIMIT)
  limit?: number;
}
