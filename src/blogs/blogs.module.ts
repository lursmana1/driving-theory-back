import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlogsController } from './blogs.controller';
import { BlogsService } from './blogs.service';
import { Blog } from './entities/blog.entity';
import { S3Module } from '../s3/s3.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Blog]), S3Module, AuthModule],
  controllers: [BlogsController],
  providers: [BlogsService],
})
export class BlogsModule {}
