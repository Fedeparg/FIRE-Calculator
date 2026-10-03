import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import type { Env } from '../config/env.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { SessionService } from './session.service.js';
import { SESSION_TTL_SECONDS } from './session.constants.js';

/**
 * Signs and validates the session (`SessionService`): registers `JwtModule` once with the auth
 * secret. Any module with controllers protected by `JwtAuthGuard` imports it. It depends on no
 * other app module, so it creates no cycles (`AuthModule` imports almost all of them).
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.getOrThrow('JWT_SECRET', { infer: true }),
        signOptions: { expiresIn: SESSION_TTL_SECONDS },
      }),
    }),
  ],
  providers: [SessionService, JwtAuthGuard],
  exports: [SessionService, JwtAuthGuard],
})
export class SessionModule {}
