import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const defaultPort = 3001;
const defaultWebUrl = 'http://localhost:3000';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? defaultPort;
  const webUrl = process.env.WEB_URL ?? defaultWebUrl;

  app.enableCors({ origin: webUrl });
  await app.listen(port);
}

void bootstrap();
