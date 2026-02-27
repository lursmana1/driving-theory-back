import { BadRequestException } from '@nestjs/common';
import { ALLOWED_IMAGE_MIMETYPES } from '../constants/upload.constants.js';

const ERROR_MESSAGE = 'Unsupported file type. Use JPEG, PNG, WebP, or GIF.';

export function validateImageFile(
  file: Express.Multer.File | undefined,
  required: boolean,
): void {
  if (!file) {
    if (required) throw new BadRequestException('Image file is required');
    return;
  }
  if (!ALLOWED_IMAGE_MIMETYPES.includes(file.mimetype as never)) {
    throw new BadRequestException(ERROR_MESSAGE);
  }
}
