import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.js';

/**
 * Issuer y Resource Server MCP, derivados una sola vez de `APP_URL` (origen público same-origin).
 * Deben ser idénticos al emitir, en la metadata y al verificar: si no, "token rejected".
 * `resource` (`<issuer>/api/mcp`) es la audiencia del token.
 */
@Injectable()
export class OAuthUrls {
  readonly issuer: URL;
  readonly resource: URL;

  constructor(config: ConfigService<Env, true>) {
    const appUrl = config.getOrThrow('APP_URL', { infer: true });
    // Sin barra final para interoperabilidad (recomendación RFC 8707/9728).
    this.issuer = new URL(appUrl.replace(/\/$/, ''));
    this.resource = new URL('/api/mcp', this.issuer);
  }

  /** Audiencia como string (lo que se guarda y compara en los tokens). */
  get audience(): string {
    return this.resource.href;
  }
}
