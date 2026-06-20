import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  create(createCategoryDto: CreateCategoryDto) {
    return 'This action adds a new category';
  }

  async findAll() {
    const rows = await this.categoryRepo.find({
      order: { id: 'ASC' },
      select: [
        'id',
        'name',
        'iconKey',
        'questionsCount',
        'subjectCount',
      ],
    });
    return rows;
  }

  async findOne(id: number) {
    const category = await this.categoryRepo.findOne({ where: { id } });
    if (!category) return null;

    const subjects = [...(category.subjects ?? [])].sort((a, b) => a.id - b.id);
    return {
      id: category.id,
      name: category.name,
      iconKey: category.iconKey,
      questionsCount: category.questionsCount,
      subjectCount: category.subjectCount,
      subjects,
    };
  }

  update(id: number, updateCategoryDto: UpdateCategoryDto) {
    return `This action updates a #${id} category`;
  }

  remove(id: number) {
    return `This action removes a #${id} category`;
  }
}
