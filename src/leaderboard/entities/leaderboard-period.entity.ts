import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('leaderboard_periods')
export class LeaderboardPeriod {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'timestamp' })
  endDate: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
