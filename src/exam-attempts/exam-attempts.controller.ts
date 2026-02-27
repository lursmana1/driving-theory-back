import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Headers,
  ParseIntPipe,
  UseGuards,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { ExamAttemptsService } from './exam-attempts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { parseLang } from '../common/utils/parse-lang.util.js';
import { parseIdList, parseCount, parseNumericId } from '../common/utils/parse-ids.util.js';
import {
  MAX_STATS_LIMIT,
  MAX_HISTORY_PAGE_SIZE,
  DEFAULT_HISTORY_PAGE_SIZE,
} from '../common/constants/exam.constants.js';

@Controller('exam-attempts')
@UseGuards(JwtAuthGuard)
export class ExamAttemptsController {
  constructor(private readonly attemptsService: ExamAttemptsService) {}

  @Post('start')
  start(
    @Req() req: { user: { userId: number } },
    @Query('lang') langQuery?: string,
    @Headers('accept-language') langHeader?: string,
    @Query('subjects') subjects?: string,
    @Query('categories') categories?: string,
    @Query('count') count?: string,
    @Query('allSubjects') allSubjects?: string,
  ) {
    return this.attemptsService.startAttempt(req.user.userId, {
      lang: parseLang(langQuery, langHeader),
      subjects: parseIdList(subjects),
      categories: parseIdList(categories),
      count: parseCount(count),
      allSubjects: allSubjects === 'true',
    });
  }

  @Post(':attemptId/answer')
  submitAnswer(
    @Req() req: { user: { userId: number } },
    @Param('attemptId', ParseIntPipe) attemptId: number,
    @Body('questionId') questionId: unknown,
    @Body('chosenAnswer') chosenAnswer: string,
  ) {
    const qId = parseNumericId(questionId);
    if (qId === null) {
      throw new BadRequestException('questionId must be a number');
    }
    return this.attemptsService.submitAnswer(
      req.user.userId,
      attemptId,
      qId,
      chosenAnswer ?? '',
    );
  }

  @Get('stats')
  getRawAnswers(
    @Req() req: { user: { userId: number } },
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    const safeLimit = limit != null ? Math.min(Math.max(1, limit), MAX_STATS_LIMIT) : MAX_STATS_LIMIT;
    return this.attemptsService.getRawAnswers(req.user.userId, safeLimit);
  }

  @Get()
  getHistory(
    @Req() req: { user: { userId: number } },
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('size', new ParseIntPipe({ optional: true })) size?: number,
  ) {
    return this.attemptsService.getHistory(
      req.user.userId,
      Math.max(1, page ?? 1),
      Math.min(MAX_HISTORY_PAGE_SIZE, Math.max(1, size ?? DEFAULT_HISTORY_PAGE_SIZE)),
    );
  }

  @Get(':id')
  getAttempt(
    @Req() req: { user: { userId: number } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.attemptsService.getAttempt(req.user.userId, id);
  }
}
