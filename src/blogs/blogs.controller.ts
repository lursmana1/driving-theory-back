import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BlogsService } from './blogs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { FILE_INTERCEPTOR_OPTIONS } from '../common/constants/upload.constants';
import { validateImageFile } from '../common/utils/file-validation.util';

@Controller('blogs')
export class BlogsController {
  constructor(private readonly blogsService: BlogsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @UseInterceptors(FileInterceptor('file', FILE_INTERCEPTOR_OPTIONS))
  create(
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
    @Body('bigText') bigText: string,
  ) {
    validateImageFile(file, true);
    if (!name?.trim()) throw new BadRequestException('Name is required');
    if (!bigText?.trim()) throw new BadRequestException('bigText is required');

    return this.blogsService.create({
      name: name.trim(),
      bigText: bigText.trim(),
      file,
    });
  }

  @Get()
  findAll() {
    return this.blogsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.blogsService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @UseInterceptors(FileInterceptor('file', FILE_INTERCEPTOR_OPTIONS))
  update(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('name') name?: string,
    @Body('bigText') bigText?: string,
  ) {
    validateImageFile(file, false);
    return this.blogsService.update(+id, {
      name: name?.trim(),
      bigText: bigText?.trim(),
      file,
    });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.blogsService.remove(+id);
  }
}
