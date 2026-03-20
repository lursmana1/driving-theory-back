import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { UserAnswer } from './user-answer.entity';

@Entity('exam_attempts')
export class ExamAttempt {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({ type: 'json' })
  questionIds: number[];

  @Column({ default: 'ka' })
  lang: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  endDate: Date | null;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'boolean', nullable: true })
  passed: boolean | null;

  @Column({ type: 'int', nullable: true })
  durationSeconds: number | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => UserAnswer, (a) => a.attempt)
  answers: UserAnswer[];
}
