import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * URLs canónicas del Authorization Server (issuer) y del Resource Server MCP (audiencia).
 *
 * Se derivan UNA sola vez de `APP_URL` (el origen público same-origin: el navegador y los
 * clientes siempre hablan con el mismo origen, que enruta `/api` y las rutas OAuth a esta
 * API). Mantenerlas idénticas al emitir, en la metadata y al verificar es lo que evita el
 * 90 % de los "token rejected" de OAuth/MCP (issuer/audience inconsistentes).
 *
 * - `issuer`   = origen público, p. ej. `http://localhost:3000` (dev).
 * - `resource` = URI canónico del servidor MCP = AUDIENCIA del token: `<issuer>/api/mcp`.
 */
@Injectable()
export class OAuthUrls {
  readonly issuer: URL;
  readonly resource: URL;

  constructor(config: ConfigService) {
    const appUrl = config.getOrThrow<string>('APP_URL');
    // Sin barra final para interoperabilidad (recomendación RFC 8707/9728).
    this.issuer = new URL(appUrl.replace(/\/$/, ''));
    this.resource = new URL('/api/mcp', this.issuer);
  }

  /** Audiencia canónica como string (lo que se guarda y compara en los tokens). */
  get audience(): string {
    return this.resource.href;
  }
}
