import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ExamAttempt } from './exam-attempt.entity';

@Entity('user_answers')
export class UserAnswer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  attemptId: number;

  @Column()
  questionId: number;

  @Column()
  subject: number;

  @Column()
  correct: boolean;

  @Column({ type: 'varchar', length: 500 })
  chosenAnswer: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => ExamAttempt, (a) => a.answers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attemptId' })
  attempt: ExamAttempt;
}
