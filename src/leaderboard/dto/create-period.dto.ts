import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePeriodDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
