import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Blog } from './entities/blog.entity';
import { S3Service } from '../s3/s3.service';

@Injectable()
export class BlogsService {
  constructor(
    @InjectRepository(Blog)
    private readonly blogsRepository: Repository<Blog>,
    private readonly s3Service: S3Service,
  ) {}

  async create(data: {
    name: string;
    bigText: string;
    file: Express.Multer.File;
  }): Promise<Blog> {
    const { url } = await this.s3Service.uploadPublicFile({
      file: data.file,
      folder: 'blogs',
    });

    const blog = this.blogsRepository.create({
      name: data.name,
      bigText: data.bigText,
      imageUrl: url,
    });

    return this.blogsRepository.save(blog);
  }

  async findAll(): Promise<Blog[]> {
    return this.blogsRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Blog> {
    const blog = await this.blogsRepository.findOne({ where: { id } });
    if (!blog) {
      throw new NotFoundException(`Blog with ID ${id} not found`);
    }
    return blog;
  }

  async update(
    id: number,
    data: {
      name?: string;
      bigText?: string;
      file?: Express.Multer.File;
    },
  ): Promise<Blog> {
    const blog = await this.findOne(id);

    if (data.name !== undefined) blog.name = data.name;
    if (data.bigText !== undefined) blog.bigText = data.bigText;
    if (data.file) {
      const { url } = await this.s3Service.uploadPublicFile({
        file: data.file,
        folder: 'blogs',
      });
      blog.imageUrl = url;
    }

    return this.blogsRepository.save(blog);
  }

  async remove(id: number): Promise<void> {
    const blog = await this.findOne(id);
    await this.blogsRepository.remove(blog);
  }
}
