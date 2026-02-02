import { Product } from '../../products/entities/product.entity';
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
  age: number;

  @Column({ nullable: true })
  password: string;

  @OneToMany(() => Product, (product: Product) => product.creator)
  products: Product[];
}
