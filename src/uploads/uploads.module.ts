import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { S3Module } from '../s3/s3.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [S3Module, AuthModule],
  controllers: [UploadsController],
})
export class UploadsModule {}
