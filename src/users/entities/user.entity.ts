import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  surname: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  password: string;

  @Column({ nullable: true, unique: true })
  googleId: string;

  @Column({ type: 'varchar', default: 'user' })
  type: 'admin' | 'user';

  /** Consecutive Tbilisi days with a GET /auth/me; see login-streak.query.ts. */
  @Column({ type: 'int', default: 0 })
  currentStreak: number;

  @Column({ type: 'int', default: 0 })
  longestStreak: number;

  /** YYYY-MM-DD in Asia/Tbilisi; null until the first visit is counted. */
  @Column({ type: 'date', nullable: true })
  lastActiveDay: string | null;
}
