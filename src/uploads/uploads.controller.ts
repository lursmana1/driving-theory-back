import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { S3Service } from '../s3/s3.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { FILE_INTERCEPTOR_OPTIONS } from '../common/constants/upload.constants.js';
import { validateImageFile } from '../common/utils/file-validation.util.js';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly s3: S3Service) {}

  @Post('blog-image')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @UseInterceptors(FileInterceptor('file', FILE_INTERCEPTOR_OPTIONS))
  uploadBlogImage(@UploadedFile() file?: Express.Multer.File) {
    validateImageFile(file, true);
    return this.s3.uploadPublicFile({ file: file!, folder: 'blogs' });
  }
}
