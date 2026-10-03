import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.js';

/**
 * MCP issuer and Resource Server, derived once from `APP_URL` (the same-origin public origin).
 * They must be identical at issuance, in the metadata and at verification: otherwise, "token
 * rejected". `resource` (`<issuer>/api/mcp`) is the token audience.
 */
@Injectable()
export class OAuthUrls {
  readonly issuer: URL;
  readonly resource: URL;

  constructor(config: ConfigService<Env, true>) {
    const appUrl = config.getOrThrow('APP_URL', { infer: true });
    // No trailing slash, for interoperability (RFC 8707/9728 recommendation).
    this.issuer = new URL(appUrl.replace(/\/$/, ''));
    this.resource = new URL('/api/mcp', this.issuer);
  }

  /** Audience as a string (what is stored and compared in tokens). */
  get audience(): string {
    return this.resource.href;
  }
}
