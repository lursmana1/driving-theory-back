import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MistakeTrainerController } from './mistake-trainer.controller';
import { MistakeTrainerQueryService } from './mistake-trainer.query.service';
import { MistakeTrainerService } from './mistake-trainer.service';

@Module({
  imports: [AuthModule],
  controllers: [MistakeTrainerController],
  providers: [MistakeTrainerService, MistakeTrainerQueryService],
})
export class MistakeTrainerModule {}
