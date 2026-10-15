import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { MAX_CHOSEN_ANSWER_LENGTH } from '../../common/constants/exam.constants.js';

export class RecordPracticeAnswerDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  questionId!: number;

  /** Omit or empty = seen-only. Prefer sending a real choice ("1"–"4"). */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CHOSEN_ANSWER_LENGTH)
  chosenAnswer?: string;
}
