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
import { ChangeLog1763900000000 } from './migrations/1763900000000-change-log';
import { Mirror1764000000000 } from './migrations/1764000000000-mirror';
import { SyncController, SyncService } from './sync';
import { ImportController } from './import';
import { CustomersController } from './customers';
import { MEDIA_DIR, MEDIA_URL, PhotosController } from './photos';
import { CustomerGuard, ShopController } from './shop';
import { Customers1764100000000 } from './migrations/1764100000000-customers';
import { ShopAccounts1764200000000 } from './migrations/1764200000000-shop-accounts';

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
      migrations: [Init1763380000000, ChangeLog1763900000000, Mirror1764000000000, Customers1764100000000, ShopAccounts1764200000000],
      migrationsRun: true,
      synchronize: false,
    }),
    TypeOrmModule.forFeature([AdminUser]),
    JwtModule.register({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '12h' } }),
  ],
  controllers: [HealthController, AuthController, SyncController, AdminController, ImportController, CustomersController, ShopController, PhotosController],
  providers: [AuthService, SyncService, ApiKeyGuard, JwtGuard, CustomerGuard],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser('json', { limit: '20mb' });
  app.set('trust proxy', 1); // host nginx is the only client (port bound to 127.0.0.1)
  app.setGlobalPrefix('api');
  // product photos saved by the admin (photos.ts); public, file names are content hashes
  app.useStaticAssets(MEDIA_DIR, {
    prefix: MEDIA_URL, maxAge: '30d', immutable: true, index: false, dotfiles: 'deny', fallthrough: false,
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT) || 3000);
}
bootstrap();
