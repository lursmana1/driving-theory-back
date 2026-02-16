import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CategoryDocument = Category & Document;

@Schema({ _id: false })
export class CategorySubject {
  @Prop({ type: Number, required: true })
  id: number;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: Number, required: true })
  questionsCount: number;
}
export const CategorySubjectSchema =
  SchemaFactory.createForClass(CategorySubject);

@Schema({
  collection: 'categories',
  timestamps: false,
})
export class Category {
  /**
   * IMPORTANT:
   * You created categories with _id = categoryId (0..9)
   * So _id should be Number.
   */
  @Prop({ type: Number, required: true })
  _id: number;

  @Prop({ type: Number, required: true })
  id: number;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, required: false })
  iconKey?: string;

  @Prop({ type: Number, required: true })
  questionsCount: number;

  @Prop({ type: Number, required: true })
  subjectCount: number;

  @Prop({ type: [CategorySubjectSchema], default: [] })
  subjects: CategorySubject[];
}

export const CategorySchema = SchemaFactory.createForClass(Category);

// Optional but nice:
CategorySchema.index({ id: 1 }, { unique: true });
