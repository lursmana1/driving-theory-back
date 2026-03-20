import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { Question, QuestionSchema } from '../questions/schemas/question.schema';
import { QuestionSyncService } from './question-sync.service';

/**
 * Minimal module for standalone sync script (avoids loading full app).
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([{ name: Question.name, schema: QuestionSchema }]),
  ],
  providers: [QuestionSyncService],
  exports: [QuestionSyncService],
})
export class QuestionSyncStandaloneModule {}
