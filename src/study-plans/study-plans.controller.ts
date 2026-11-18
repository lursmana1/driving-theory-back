import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { STATIC_PUBLIC_CACHE_CONTROL } from '../common/constants/http-cache.constants.js';
import { parseLang } from '../common/utils/parse-lang.util.js';
import { PlanPreviewQueryDto } from './dto/plan-preview-query.dto.js';
import { SavePlanDto } from './dto/save-plan.dto.js';
import { SavedPlansService } from './saved-plans.service.js';
import { StudyPlansService } from './study-plans.service.js';
import type {
  PlanDaySession,
  PlanQuery,
  SavedStudyPlanView,
  StudyPlanPreview,
} from './study-plans.types.js';

type AuthRequest = { user: { userId: number } };

function toPlanQuery(query: PlanPreviewQueryDto): PlanQuery {
  return {
    categoryId: query.category,
    days: query.days,
    examDay: query.examDay,
  };
}

/**
 * `preview*`: public, read-only, same answer for every caller with the same
 * query on the same study day (short public cache, no user data).
 * `me`: JWT, the caller's own saved plan; never cached.
 */
@Controller('study-plans')
export class StudyPlansController {
  constructor(
    private readonly plans: StudyPlansService,
    private readonly saved: SavedPlansService,
  ) {}

  @Get('preview')
  @Header('Cache-Control', STATIC_PUBLIC_CACHE_CONTROL)
  getPreview(@Query() query: PlanPreviewQueryDto): Promise<StudyPlanPreview> {
    return this.plans.getPreview(toPlanQuery(query));
  }

  @Get('preview/days/:index')
  @Header('Cache-Control', STATIC_PUBLIC_CACHE_CONTROL)
  // The language may come from Accept-Language: shared caches must key on it.
  @Header('Vary', 'Accept-Language')
  getDay(
    @Param('index', ParseIntPipe) index: number,
    @Query() query: PlanPreviewQueryDto,
    @Query('lang') langQuery?: string,
    @Headers('accept-language') langHeader?: string,
  ): Promise<PlanDaySession> {
    return this.plans.getDay(
      toPlanQuery(query),
      index,
      parseLang(langQuery, langHeader),
    );
  }

  /** 404 when the user has no plan yet. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  getMine(@Req() req: AuthRequest): Promise<SavedStudyPlanView> {
    return this.saved.getMine(req.user.userId);
  }

  /** Create or replace the caller's plan (choice + progress). */
  @Put('me')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  saveMine(
    @Req() req: AuthRequest,
    @Body() body: SavePlanDto,
  ): Promise<SavedStudyPlanView> {
    return this.saved.saveMine(req.user.userId, body);
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  deleteMine(@Req() req: AuthRequest): Promise<void> {
    return this.saved.deleteMine(req.user.userId);
  }
}
