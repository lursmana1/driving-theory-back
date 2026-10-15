import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { OptionalQueryNumber } from '../../common/utils/query-number.util.js';
import {
  MAX_EXAM_QUESTION_COUNT,
  MIN_EXAM_QUESTION_COUNT,
} from '../../common/constants/exam.constants.js';

export class StartAttemptQueryDto {
  /** Ticket size override. Omit to use the category's official rule. */
  @OptionalQueryNumber()
  @IsOptional()
  @IsInt()
  @Min(MIN_EXAM_QUESTION_COUNT)
  @Max(MAX_EXAM_QUESTION_COUNT)
  count?: number;
}
