import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  Req,
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
    @Req() req: { user: { userId: number } },
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
    @Body('description') description: string,
    @Body('content') content: string,
  ) {
    validateImageFile(file, true);
    if (!name?.trim()) throw new BadRequestException('Name is required');
    if (!description?.trim()) throw new BadRequestException('Description is required');
    if (!content?.trim()) throw new BadRequestException('Content is required');

    return this.blogsService.create({
      creatorId: req.user.userId,
      name: name.trim(),
      description: description.trim(),
      content,
      file,
    });
  }

  @Get()
  findAll(@Query('page', new ParseIntPipe({ optional: true })) page?: number) {
    return this.blogsService.findAll(page ?? 1);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.blogsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @UseInterceptors(FileInterceptor('file', FILE_INTERCEPTOR_OPTIONS))
  update(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('name') name?: string,
    @Body('description') description?: string,
    @Body('content') content?: string,
  ) {
    validateImageFile(file, false);
    return this.blogsService.update(id, {
      name: name?.trim(),
      description: description?.trim(),
      content: content,
      file,
    });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.blogsService.remove(id);
  }
}
