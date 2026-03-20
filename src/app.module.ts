import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { BlogsModule } from './blogs/blogs.module';
import { Blog } from './blogs/entities/blog.entity';
import { CategoriesModule } from './categories/categories.module';
import { ExamsModule } from './exams/exams.module';
import { ExamAttemptsModule } from './exam-attempts/exam-attempts.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { QuestionsModule } from './questions/questions.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';
import { UserStatsModule } from './user-stats/user-stats.module';
import { QuestionSyncModule } from './question-sync/question-sync.module';
import { User } from './users/entities/user.entity';
import { ExamAttempt } from './exam-attempts/entities/exam-attempt.entity';
import { UserAnswer } from './exam-attempts/entities/user-answer.entity';
import { LeaderboardPeriod } from './leaderboard/entities/leaderboard-period.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'mysql' as const,
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_DATABASE'),
        entities: [User, Blog, ExamAttempt, UserAnswer, LeaderboardPeriod],
        synchronize: config.get('DB_SYNCHRONIZE') === 'true',
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    BlogsModule,
    CategoriesModule,
    ExamsModule,
    ExamAttemptsModule,
    LeaderboardModule,
    QuestionsModule,
    UploadsModule,
    UsersModule,
    UserStatsModule,
    QuestionSyncModule,
  ],
})
export class AppModule {}
