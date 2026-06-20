import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserStatsController } from './user-stats.controller';
import { UserStatsService } from './user-stats.service';
import { UserAnswer } from '../exam-attempts/entities/user-answer.entity';
import { Question } from '../questions/entities/question.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserAnswer, Question]),
    AuthModule,
  ],
  controllers: [UserStatsController],
  providers: [UserStatsService],
})
export class UserStatsModule {}
