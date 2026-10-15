import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Each id costs ~5s of Gemini pacing, so this keeps one HTTP request under
 * typical proxy timeouts. Larger batches: `npm run sync:questions <limit> <offset>`.
 */
export const MAX_SYNC_LIMIT_PER_REQUEST = 20;

export class RunSyncDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SYNC_LIMIT_PER_REQUEST)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
