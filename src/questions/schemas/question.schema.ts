import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type QuestionDocument = Question & Document;

@Schema({ collection: 'questions', strict: false })
export class Question {
  @Prop()
  id: number;

  @Prop()
  question: string;

  @Prop()
  question_explained: string;

  @Prop()
  hasImg: number;

  @Prop()
  correct_answer: string;

  @Prop()
  answer_1: string;

  @Prop()
  answer_2: string;

  @Prop()
  answer_3: string;

  @Prop()
  answer_4: string;

  @Prop()
  subject: number;

  @Prop([Number])
  categories: number[];

  @Prop()
  audio: string;

  @Prop({ default: 'ka' })
  lang: string;

  @Prop()
  ai_tutor: string;
}

export const QuestionSchema = SchemaFactory.createForClass(Question);

QuestionSchema.index({ lang: 1, categories: 1, subject: 1 });
QuestionSchema.index({ lang: 1, id: 1 });
