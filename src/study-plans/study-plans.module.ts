import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Question } from '../questions/entities/question.entity';
import { StudyPlan } from './entities/study-plan.entity';
import { SavedPlansService } from './saved-plans.service';
import { StudyPlansController } from './study-plans.controller';
import { StudyPlansQueryService } from './study-plans.query.service';
import { StudyPlansService } from './study-plans.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Question, StudyPlan])],
  controllers: [StudyPlansController],
  providers: [StudyPlansService, StudyPlansQueryService, SavedPlansService],
})
export class StudyPlansModule {}
