import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  password: string;

  @Column({ nullable: true, unique: true })
  googleId: string;

  @Column({ type: 'varchar', default: 'user' })
  type: 'admin' | 'user';
}
