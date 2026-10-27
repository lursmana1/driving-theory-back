import {
  Controller,
  Get,
  Headers,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { parseLang } from '../common/utils/parse-lang.util.js';
import { MistakeTrainerService } from './mistake-trainer.service.js';
import {
  TrainerSessionQueryDto,
  TrainerSummaryQueryDto,
} from './dto/trainer-query.dto.js';
import type {
  TrainerSessionResponse,
  TrainerSummary,
} from './mistake-trainer.types.js';

type AuthRequest = { user: { userId: number } };

/** Every route is per user: JWT required, data scoped to req.user.userId. */
@Controller('trainer')
@UseGuards(JwtAuthGuard)
export class MistakeTrainerController {
  constructor(private readonly trainer: MistakeTrainerService) {}

  /** Counts for the profile badge / trainer entry point. */
  @Get('summary')
  getSummary(
    @Req() req: AuthRequest,
    @Query() query: TrainerSummaryQueryDto,
    @Query('lang') langQuery?: string,
    @Headers('accept-language') langHeader?: string,
  ): Promise<TrainerSummary> {
    return this.trainer.getSummary({
      userId: req.user.userId,
      categoryId: query.category,
      lang: parseLang(langQuery, langHeader),
    });
  }

  /** Next batch of mistakes to drill, with full questions and progress. */
  @Get('session')
  getSession(
    @Req() req: AuthRequest,
    @Query() query: TrainerSessionQueryDto,
    @Query('lang') langQuery?: string,
    @Headers('accept-language') langHeader?: string,
  ): Promise<TrainerSessionResponse> {
    return this.trainer.getSession(
      {
        userId: req.user.userId,
        categoryId: query.category,
        lang: parseLang(langQuery, langHeader),
        subjects: query.subjects,
      },
      query.limit,
    );
  }
}
