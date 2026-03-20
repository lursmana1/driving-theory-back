import { Controller, Get, Headers, UseGuards, Req } from '@nestjs/common';
import { UserStatsService } from './user-stats.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { parseLang } from '../common/utils/parse-lang.util.js';

@Controller('user-stats')
@UseGuards(JwtAuthGuard)
export class UserStatsController {
  constructor(private readonly userStatsService: UserStatsService) {}

  @Get('weak-questions')
  getWeakQuestions(
    @Req() req: { user: { userId: number } },
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const lang = parseLang(undefined, acceptLanguage);
    return this.userStatsService.getWeakQuestions(req.user.userId, lang);
  }

  @Get('weak-subjects')
  getWeakSubjects(
    @Req() req: { user: { userId: number } },
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const lang = parseLang(undefined, acceptLanguage);
    return this.userStatsService.getWeakSubjects(req.user.userId, lang);
  }
}
