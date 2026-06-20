import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamsService } from './exams.service';
import { ExamsController } from './exams.controller';
import { Exam } from './entities/exam.entity';
import { Question } from '../questions/entities/question.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Exam, Question])],
  controllers: [ExamsController],
  providers: [ExamsService],
})
export class ExamsModule {}
