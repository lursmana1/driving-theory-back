import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * A lesson card: a road sign / marking, or (later) a rule topic. Seeded from
 * reviewed JSON in the frontend repo (`src/data/signs`, `src/data/rules`);
 * nobody edits cards in the database. Lessons show a card, then its tickets.
 *
 * Schema: `npm run db:ensure-cards`. Data: `npm run db:seed-cards`.
 */
@Entity('learning_cards')
@Index('idx_learning_cards_subject', ['subjectId', 'order'])
export class LearningCard {
  /** "sign-1.1", "marking-1.1", "rule-29-bleeding". */
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  /** sign | marking | rule */
  @Column({ type: 'varchar', length: 10 })
  kind: string;

  /** The subject whose lessons teach this card. */
  @Column({ type: 'smallint' })
  subjectId: number;

  /** Teaching order inside the subject. */
  @Column({ type: 'int' })
  order: number;

  /** Public image path (signs: `/images/signs/...svg`); null for most rules. */
  @Column({ type: 'varchar', length: 256, nullable: true })
  image: string | null;

  /** Official number for signs and markings ("1.4.1"); null for rules. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  signNumber: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
