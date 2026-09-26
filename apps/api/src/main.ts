import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { ValidationError } from 'class-validator';
import { AppModule } from './app.module';

const defaultPort = 3001;
const defaultWebUrl = 'http://localhost:3000';

function createValidationException(errors: ValidationError[]): BadRequestException {
  const messages = getValidationMessages(errors);

  return new BadRequestException({
    statusCode: 400,
    error: 'Yêu cầu không hợp lệ',
    message: messages,
  });
}

function getValidationMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => {
    const ownMessages = Object.entries(error.constraints ?? {}).map(([constraintName, message]) =>
      constraintName === 'whitelistValidation'
        ? `${error.property} không được phép xuất hiện.`
        : message,
    );

    return [...ownMessages, ...getValidationMessages(error.children ?? [])];
  });
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? defaultPort;
  const webUrl = process.env.WEB_URL ?? defaultWebUrl;

  app.enableCors({ origin: webUrl });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      exceptionFactory: createValidationException,
      stopAtFirstError: true,
      transform: true,
      whitelist: true,
    }),
  );
  await app.listen(port);
}

void bootstrap();
