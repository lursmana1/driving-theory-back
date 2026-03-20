import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class RunSyncDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
