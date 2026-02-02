import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // ← This enables @Transform decorators!
    }),
  );

  // Allow React (or any frontend) to make requests
  app.enableCors({
    // Cookies require credentials=true and a non-"*" origin.
    origin: (process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'),
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
