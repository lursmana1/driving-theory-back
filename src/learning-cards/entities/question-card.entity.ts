import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Which card(s) a ticket belongs to. Per logical question id (shared by
 * ka/en/ru and by every category). Exactly one `primary` card per question:
 * the card the ticket is taught under. Only `confirmed` links are used.
 */
@Entity('question_cards')
@Index('idx_question_cards_card', ['cardId'])
@Index('uq_question_cards_primary', ['questionId'], {
  unique: true,
  where: '"primary"',
})
export class QuestionCard {
  @PrimaryColumn({
    type: 'int',
    primaryKeyConstraintName: 'pk_question_cards',
  })
  questionId: number;

  @PrimaryColumn({
    type: 'varchar',
    length: 64,
    primaryKeyConstraintName: 'pk_question_cards',
  })
  cardId: string;

  @Column({ type: 'boolean', default: false })
  primary: boolean;

  /** regex | gemini | manual */
  @Column({ type: 'varchar', length: 10 })
  source: string;

  @Column({ type: 'boolean', default: false })
  confirmed: boolean;
}
