import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('blogs')
export class Blog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'text' })
  bigText: string;

  @Column()
  imageUrl: string;

  @CreateDateColumn()
  createdAt: Date;
}
