import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Blog } from '../blogs/entities/blog.entity';
import { Category } from '../categories/entities/category.entity';
import { ExamAttempt } from '../exam-attempts/entities/exam-attempt.entity';
import { UserAnswer } from '../exam-attempts/entities/user-answer.entity';
import { PracticeAnswer } from '../practice-answers/entities/practice-answer.entity';
import { QuestionProgress } from '../question-progress/entities/question-progress.entity';
import { LeaderboardPeriod } from '../leaderboard/entities/leaderboard-period.entity';
import { Question } from '../questions/entities/question.entity';
import { User } from '../users/entities/user.entity';
import { PasswordReset } from '../auth/entities/password-reset.entity';
import { StudyPlan } from '../study-plans/entities/study-plan.entity';
import { LearningCard } from '../learning-cards/entities/learning-card.entity';
import { LearningCardText } from '../learning-cards/entities/learning-card-text.entity';
import { QuestionCard } from '../learning-cards/entities/question-card.entity';

export const TYPEORM_ENTITIES = [
  User,
  PasswordReset,
  Blog,
  ExamAttempt,
  UserAnswer,
  PracticeAnswer,
  QuestionProgress,
  StudyPlan,
  LearningCard,
  LearningCardText,
  QuestionCard,
  LeaderboardPeriod,
  Question,
  Category,
];

function pgConnection(config: ConfigService) {
  const url = config.get<string>('DATABASE_URL');
  if (url) {
    const needsSsl =
      config.get('DATABASE_SSL') === 'true' ||
      url.includes('sslmode=require') ||
      url.includes('neon.tech');
    return {
      type: 'postgres' as const,
      url,
      ssl: needsSsl ? { rejectUnauthorized: false } : false,
    };
  }

  return {
    type: 'postgres' as const,
    host: config.get<string>('PG_HOST') || 'localhost',
    port: Number(config.get<string>('PG_PORT')) || 5432,
    username: config.get<string>('PG_USERNAME') || 'postgres',
    password: config.get<string>('PG_PASSWORD') || '',
    database: config.get<string>('PG_DATABASE') || 'driving_theory_back',
  };
}

export function buildTypeOrmOptions(
  config: ConfigService,
): TypeOrmModuleOptions {
  return {
    ...pgConnection(config),
    entities: TYPEORM_ENTITIES,
    // Never let schema sync run against production, whatever the env says.
    synchronize:
      config.get('NODE_ENV') !== 'production' &&
      config.get('DB_SYNCHRONIZE') === 'true',
  };
}
