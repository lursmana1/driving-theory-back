export const ALLOWED_IMAGE_MIMETYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/jpg',
  'image/svg+xml',
  'image/avif',
] as const;

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

export const FILE_INTERCEPTOR_OPTIONS = {
  limits: { fileSize: MAX_IMAGE_SIZE },
};
