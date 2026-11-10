import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { OptionalQueryNumber } from '../../common/utils/query-number.util.js';
import { CARD_LESSON_MAX_CARDS } from '../../common/constants/learning-cards.constants.js';

/** `?category=1&subject=3&from=0&count=8` (prototype card lesson). */
export class CardLessonQueryDto {
  @OptionalQueryNumber()
  @IsInt()
  @Min(0)
  @Max(9)
  category!: number;

  @OptionalQueryNumber()
  @IsInt()
  @Min(1)
  @Max(99)
  subject!: number;

  /** Index of the first card (cards are in teaching order). */
  @OptionalQueryNumber()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  from?: number;

  @OptionalQueryNumber()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(CARD_LESSON_MAX_CARDS)
  count?: number;
}
