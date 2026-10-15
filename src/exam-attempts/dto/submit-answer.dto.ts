import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { MAX_CHOSEN_ANSWER_LENGTH } from '../../common/constants/exam.constants.js';

export class SubmitAnswerDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  questionId!: number;

  /**
   * Omitted or empty is graded as a wrong answer. A JSON number (`2`) is
   * accepted as `"2"`, as it was before this body had a DTO.
   */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'number' ? String(value) : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CHOSEN_ANSWER_LENGTH)
  chosenAnswer?: string;
}
