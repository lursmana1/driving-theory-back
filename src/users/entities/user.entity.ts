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

  /** Consecutive study days with a GET /auth/me; see login-streak.query.ts. */
  @Column({ type: 'int', default: 0 })
  currentStreak: number;

  @Column({ type: 'int', default: 0 })
  longestStreak: number;

  /** Study day (Tbilisi, starts 04:00) of the last visit; null until the first one. */
  @Column({ type: 'date', nullable: true })
  lastActiveDay: string | null;

  /**
   * Bumped on a password reset. Every JWT carries the value it was signed
   * with (`ver`); a token with an older value is rejected, which logs out
   * every device. See `scripts/ensure-password-resets.ts`.
   */
  @Column({ type: 'int', default: 0 })
  tokenVersion: number;
}
