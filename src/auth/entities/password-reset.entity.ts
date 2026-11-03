import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * One password-reset link. Only the sha256 of the token is stored, so a
 * database leak cannot be turned into working links. A link works once,
 * until `expiresAt`. Schema: `scripts/ensure-password-resets.ts`.
 */
@Entity('password_resets')
@Index('idx_password_resets_user_created', ['userId', 'createdAt'])
export class PasswordReset {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** Hex sha256 of the token sent by email. */
  @Index('uq_password_resets_token_hash', { unique: true })
  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** Set when the link is used or replaced by a newer one. */
  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
