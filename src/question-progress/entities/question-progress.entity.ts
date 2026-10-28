import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * Per user × logical question learning state, written on every graded answer
 * (timed exams and practice). Question ids are shared across ka/ru/en, so
 * progress is per id, not per lang.
 *
 * `dueAt` not null = active mistake (due once `dueAt <= now()`).
 * `clearedAt` set = was a mistake, cleared by spaced reviews.
 *
 * Schema in production: `npm run db:ensure-question-progress`.
 */
@Entity('question_progress')
@Index('idx_question_progress_user_due', ['userId', 'dueAt'], {
  where: '"dueAt" IS NOT NULL',
})
export class QuestionProgress {
  @PrimaryColumn({
    type: 'int',
    primaryKeyConstraintName: 'pk_question_progress',
  })
  userId: number;

  @PrimaryColumn({
    type: 'int',
    primaryKeyConstraintName: 'pk_question_progress',
  })
  questionId: number;

  @Column({ type: 'int', default: 0 })
  wrongCount: number;

  @Column({ type: 'int', default: 0 })
  correctCount: number;

  /** Correct due reviews since the last wrong answer. */
  @Column({ type: 'smallint', default: 0 })
  box: number;

  /**
   * Correct due reviews still needed to clear the mistake, set by the last
   * wrong answer from the answer record (see `MISTAKE_MAX_REVIEWS`). 0 when
   * not a mistake.
   */
  @Column({ type: 'smallint', default: 0 })
  reviewsLeft: number;

  @Column({ type: 'boolean' })
  lastResult: boolean;

  @Column({ type: 'timestamptz' })
  firstAnsweredAt: Date;

  @Column({ type: 'timestamptz' })
  lastAnsweredAt: Date;

  /** Last answer given while the question was due (right or wrong). */
  @Column({ type: 'timestamptz', nullable: true })
  lastReviewedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  dueAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  clearedAt: Date | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
