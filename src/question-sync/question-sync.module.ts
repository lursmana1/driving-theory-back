import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Question } from '../questions/entities/question.entity';
import { QuestionSyncController } from './question-sync.controller';
import { QuestionSyncService } from './question-sync.service';

@Module({
  imports: [TypeOrmModule.forFeature([Question])],
  controllers: [QuestionSyncController],
  providers: [QuestionSyncService],
  exports: [QuestionSyncService],
})
export class QuestionSyncModule {}
