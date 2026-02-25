import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { randomUUID } from 'crypto';

@Injectable()
export class S3Service {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION')!;
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET')!;
    this.publicBaseUrl =
      this.configService.get<string>('AWS_PUBLIC_BASE_URL') ||
      `https://${this.bucket}.s3.${region}.amazonaws.com`;

    this.s3 = new S3Client({
      region,
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID')!,
        secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY')!,
      },
    });
  }

  async uploadPublicFile(params: {
    file: Express.Multer.File;
    folder: string;
    keyPrefix?: string;
  }): Promise<{ key: string; url: string }> {
    const { file, folder, keyPrefix } = params;
    const ext = this.getFileExtension(file.originalname);
    const key = keyPrefix
      ? `${folder}/${keyPrefix}/${randomUUID()}${ext}`
      : `${folder}/${randomUUID()}${ext}`;

    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        CacheControl: 'public, max-age=31536000, immutable',
      },
    });

    await upload.done();
    return { key, url: `${this.publicBaseUrl}/${key}` };
  }

  private getFileExtension(filename: string): string {
    const ext = filename?.includes('.') ? filename.split('.').pop() : '';
    return ext ? `.${ext.toLowerCase()}` : '';
  }
}
