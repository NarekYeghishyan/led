import {
  Body, CanActivate, Controller, ExecutionContext, Get, Injectable, OnApplicationBootstrap,
  Post, Req, UnauthorizedException, UseGuards, Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { timingSafeEqual } from 'crypto';
import { AdminUser } from './entities';

/** Protects /api/sync/* — the store agent sends header X-Api-Key. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.SYNC_API_KEY || '';
    const got = String(ctx.switchToHttp().getRequest().headers['x-api-key'] || '');
    if (expected.length < 16 || got.length !== expected.length
      || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
      throw new UnauthorizedException('Invalid API key');
    }
    return true;
  }
}

/** Protects /api/admin/* — Authorization: Bearer <jwt>. */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private jwt: JwtService) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const [type, token] = String(req.headers.authorization || '').split(' ');
    if (type !== 'Bearer' || !token) throw new UnauthorizedException();
    try {
      const user = this.jwt.verify(token);
      if (user?.kind === 'customer') throw new Error('customer token'); // storefront tokens never open the admin API
      req.user = user;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private log = new Logger('Auth');
  constructor(@InjectRepository(AdminUser) private users: Repository<AdminUser>, private jwt: JwtService) {}

  /** Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD when the table is empty. */
  async onApplicationBootstrap() {
    const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password || (await this.users.count()) > 0) return;
    await this.users.save({ email, passwordHash: await bcrypt.hash(password, 10), role: 'admin' });
    this.log.log(`Created first admin user ${email}`);
  }

  async login(email: string, password: string) {
    const user = await this.users.findOneBy({ email: String(email || '').toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
      throw new UnauthorizedException('Wrong email or password');
    }
    const payload = { sub: user.id, email: user.email, role: user.role };
    return { token: this.jwt.sign(payload), user: payload };
  }
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body?.email, body?.password);
  }

  @Get('me')
  @UseGuards(JwtGuard)
  me(@Req() req: { user: unknown }) {
    return req.user;
  }
}
