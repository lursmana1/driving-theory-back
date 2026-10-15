import { IsInt, IsOptional } from 'class-validator';
import { OptionalQueryNumber } from '../../common/utils/query-number.util.js';

/**
 * Numeric query params for the question list endpoints. Only the type is
 * enforced here; the controller clamps ranges, as it always has.
 */
class QuestionFilterQueryDto {
  @OptionalQueryNumber()
  @IsOptional()
  @IsInt()
  category?: number;
}

export class ListQuestionsQueryDto extends QuestionFilterQueryDto {
  @OptionalQueryNumber()
  @IsOptional()
  @IsInt()
  page?: number;
}

export class RandomQuestionsQueryDto extends QuestionFilterQueryDto {
  @OptionalQueryNumber()
  @IsOptional()
  @IsInt()
  count?: number;
}
