import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Card text per language. `body` is the official text (sign description from
 * the law / reviewed rule text); `tutor` is the short plain-language
 * explanation that is read aloud (`audio`). Both null-able until written.
 */
@Entity('learning_card_texts')
export class LearningCardText {
  @PrimaryColumn({
    type: 'varchar',
    length: 64,
    primaryKeyConstraintName: 'pk_learning_card_texts',
  })
  cardId: string;

  @PrimaryColumn({
    type: 'varchar',
    length: 5,
    primaryKeyConstraintName: 'pk_learning_card_texts',
  })
  lang: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', nullable: true })
  body: string | null;

  /** Plain-language AI tutor text, reviewed (step 2). */
  @Column({ type: 'text', nullable: true })
  tutor: string | null;

  /** Audio of `tutor` (S3 URL), filled by the audio script (step 4). */
  @Column({ type: 'varchar', length: 512, nullable: true })
  audio: string | null;
}
