import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { UserStatsController } from './user-stats.controller';
import { UserStatsService } from './user-stats.service';
import { UserAnswer } from '../exam-attempts/entities/user-answer.entity';
import { Question, QuestionSchema } from '../questions/schemas/question.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserAnswer]),
    MongooseModule.forFeature([{ name: Question.name, schema: QuestionSchema }]),
    AuthModule,
  ],
  controllers: [UserStatsController],
  providers: [UserStatsService],
})
export class UserStatsModule {}
