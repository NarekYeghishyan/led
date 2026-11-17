import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin';
import { ApiKeyGuard, AuthController, AuthService, JwtGuard } from './auth';
import { AdminUser, ENTITIES } from './entities';
import { Init1763380000000 } from './migrations/1763380000000-init';
import { SyncController, SyncService } from './sync';

for (const name of ['DATABASE_URL', 'JWT_SECRET', 'SYNC_API_KEY']) {
  if (!process.env[name]) throw new Error(`Missing env ${name}`);
}

@Controller('health')
class HealthController {
  @Get() health() { return { ok: true }; }
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: ENTITIES,
      migrations: [Init1763380000000],
      migrationsRun: true,
      synchronize: false,
    }),
    TypeOrmModule.forFeature([AdminUser]),
    JwtModule.register({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '12h' } }),
  ],
  controllers: [HealthController, AuthController, SyncController, AdminController],
  providers: [AuthService, SyncService, ApiKeyGuard, JwtGuard],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: '20mb' });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT) || 3000);
}
bootstrap();
