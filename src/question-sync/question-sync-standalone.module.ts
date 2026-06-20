import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Question } from '../questions/entities/question.entity';
import { QuestionSyncService } from './question-sync.service';
import { buildTypeOrmOptions } from '../config/typeorm.config';
import { ConfigService } from '@nestjs/config';

/**
 * Minimal module for standalone sync script (avoids loading full app).
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => buildTypeOrmOptions(config),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Question]),
  ],
  providers: [QuestionSyncService],
  exports: [QuestionSyncService],
})
export class QuestionSyncStandaloneModule {}
