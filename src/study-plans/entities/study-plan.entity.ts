import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { StudyPlanProgress } from '../study-plans.types';

/**
 * A signed-in user's study plan (MVP: one active plan per user). The days
 * themselves are rebuilt from (categoryId, dayCount); only the choice and
 * the progress are stored. Guests keep the same shape in localStorage.
 *
 * Schema in production: `npm run db:ensure-study-plans`.
 */
@Entity('study_plans')
export class StudyPlan {
  @PrimaryColumn({ type: 'int', primaryKeyConstraintName: 'pk_study_plans' })
  userId: number;

  @Column({ type: 'smallint' })
  categoryId: number;

  @Column({ type: 'smallint' })
  dayCount: number;

  /** First study day. */
  @Column({ type: 'date' })
  startDay: string;

  @Column({ type: 'date', nullable: true })
  examDay: string | null;

  @Column({ type: 'jsonb', default: () => `'{"done":{},"tests":{}}'` })
  progress: StudyPlanProgress;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
