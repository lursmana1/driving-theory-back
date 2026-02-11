import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Question } from '../../questions/schemas/question.schema';

export type ExamDocument = Exam & Document;

@Schema({ timestamps: true, collection: 'exams' })
export class Exam {
  @Prop()
  title: string;

  // Array of references to Question documents
  @Prop({
    type: [{ type: Types.ObjectId, ref: Question.name }],
    default: [],
  })
  questions: Types.ObjectId[];
}

export const ExamSchema = SchemaFactory.createForClass(Exam);

