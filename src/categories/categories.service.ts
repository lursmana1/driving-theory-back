import { Injectable } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category, CategoryDocument } from './schemas/categories.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name)
    private categoryModel: Model<CategoryDocument>,
  ) {}
  create(createCategoryDto: CreateCategoryDto) {
    return 'This action adds a new category';
  }

  async findAll() {
    return this.categoryModel
      .find(
        {},
        {
          _id: 0,
          id: 1,
          name: 1,
          iconKey: 1,
          questionsCount: 1,
          subjectCount: 1,
        },
      )
      .sort({ id: 1 })
      .lean()
      .exec();
  }
  async findOne(id: number) {
    const [category] = await this.categoryModel
      .aggregate([
        { $match: { id } },
        {
          $set: {
            subjects: { $sortArray: { input: '$subjects', sortBy: { id: 1 } } },
          },
        },
        { $project: { _id: 0 } },
      ])
      .exec();

    return category ?? null;
  }
  update(id: number, updateCategoryDto: UpdateCategoryDto) {
    return `This action updates a #${id} category`;
  }

  remove(id: number) {
    return `This action removes a #${id} category`;
  }
}
