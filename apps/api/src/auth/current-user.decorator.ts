import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { SessionUser } from './auth.service.js';
import type { AuthedRequest } from './jwt-auth.guard.js';

/** Inyecta el usuario autenticado (poblado por JwtAuthGuard) en el handler. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): SessionUser => {
  const request = ctx.switchToHttp().getRequest<AuthedRequest>();
  return request.user;
});
