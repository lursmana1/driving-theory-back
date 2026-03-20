import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Question, QuestionSchema } from '../questions/schemas/question.schema';
import { QuestionSyncController } from './question-sync.controller';
import { QuestionSyncService } from './question-sync.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Question.name, schema: QuestionSchema }]),
  ],
  controllers: [QuestionSyncController],
  providers: [QuestionSyncService],
  exports: [QuestionSyncService],
})
export class QuestionSyncModule {}
