import { Column, Entity, PrimaryColumn } from 'typeorm';

export type CategorySubjectRow = {
  id: number;
  name: string;
  questionsCount: number;
};

@Entity('categories')
export class Category {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  iconKey: string | null;

  @Column({ type: 'int', default: 0 })
  questionsCount: number;

  @Column({ type: 'int', default: 0 })
  subjectCount: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  subjects: CategorySubjectRow[];
}
