import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('blogs')
export class Blog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  description: string;

  @Column({ type: 'text' })
  content: string;

  @Column()
  imageUrl: string;

  // Written only by INCREMENT_BLOG_VIEWS_SQL; `update: false` keeps a stale
  // entity save (admin edit) from overwriting concurrent increments.
  @Column({ type: 'int', default: 0, update: false })
  viewsCount: number;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'creatorId' })
  creator: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
