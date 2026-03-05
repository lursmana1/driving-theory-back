import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  ParseIntPipe,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { CreatePeriodDto } from './dto/create-period.dto.js';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  async getLeaderboard(
    @Req() req: { user?: { userId: number } },
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    const current = await this.leaderboardService.getCurrentPeriod();
    if (!current) {
      throw new BadRequestException(
        'No active leaderboard. Leaderboard is only available between its startDate and endDate.',
      );
    }

    const safePage = page != null ? Math.max(1, page) : 1;
    const safeLimit = limit != null ? Math.min(Math.max(1, limit), 100) : 10;
    return this.leaderboardService.getLeaderboard(
      req.user?.userId ?? null,
      current.id,
      safePage,
      safeLimit,
    );
  }

  @Post('periods')
  @UseGuards(JwtAuthGuard, AdminGuard)
  createPeriod(@Body() dto: CreatePeriodDto) {
    return this.leaderboardService.createPeriod({
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      name: dto.name,
    });
  }
}
