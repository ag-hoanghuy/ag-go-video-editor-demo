import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { AssetsModule } from './assets/assets.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: join(__dirname, '../../../.env'),
      isGlobal: true,
    }),
    HealthModule,
    AssetsModule,
  ],
})
export class AppModule {}
