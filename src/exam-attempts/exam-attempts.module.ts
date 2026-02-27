import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { ExamAttempt } from './entities/exam-attempt.entity';
import { UserAnswer } from './entities/user-answer.entity';
import { Question, QuestionSchema } from '../questions/schemas/question.schema';
import { ExamAttemptsController } from './exam-attempts.controller';
import { ExamAttemptsService } from './exam-attempts.service';
import { QuestionSelectionService } from './question-selection.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExamAttempt, UserAnswer]),
    MongooseModule.forFeature([{ name: Question.name, schema: QuestionSchema }]),
    AuthModule,
  ],
  controllers: [ExamAttemptsController],
  providers: [ExamAttemptsService, QuestionSelectionService],
  exports: [ExamAttemptsService, QuestionSelectionService],
})
export class ExamAttemptsModule {}
