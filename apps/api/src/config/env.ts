import { z } from 'zod';

/** Secreto de desarrollo (el del `.env.example` y el de `docker-compose.yml`): en producción está prohibido. */
export const DEV_JWT_SECRET = 'dev_insecure_secret_change_me';

/** Longitud mínima del `JWT_SECRET` en producción: 32 caracteres (HS256 pide al menos 256 bits de clave). */
export const MIN_PRODUCTION_JWT_SECRET_LENGTH = 32;

/**
 * Compose pasa `VAR: ${VAR:-}`, así que una variable "no definida" llega como `""`. Se trata
 * como ausente (igual que hacía el antiguo `?.trim() || DEFAULT`) para que el defecto aplique.
 */
function blankToUndefined(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    ]),
  );
}

const required = (name: string) => z.string({ error: `${name} es obligatoria` });

/**
 * Entero tolerante: ausente, no numérico o por debajo de `min` cae al defecto en vez de fallar.
 * Es deliberado: un typo en `TRUST_PROXY_HOPS` no debe confiar en todo `X-Forwarded-For`, ni uno
 * en una retención convertirse en un borrado agresivo. Mantiene la semántica de `parseInt`.
 */
const lenientInt = (min: number, fallback: number) =>
  z
    .string()
    .optional()
    .transform((raw) => {
      const parsed = Number.parseInt(raw?.trim() ?? '', 10);
      return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
    });

/** Texto opcional sin espacios sobrantes (claves de API, remitente, crons). */
const optionalText = z.string().trim().optional();

/** Lo único que necesita el migrador one-shot (`db/migrate.ts`), que corre sin Nest. */
const databaseEnvSchema = z.object({
  DATABASE_URL: required('DATABASE_URL'),
});

const appEnvSchema = z
  .object({
    ...databaseEnvSchema.shape,
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    // No se recorta: un espacio sobrante cambiaría la firma de las sesiones ya emitidas.
    JWT_SECRET: required('JWT_SECRET'),
    // Estricto `=== 'true'`: cualquier otro valor (incluido "TRUE" o "1") es `false`.
    COOKIE_SECURE: z
      .string()
      .optional()
      .transform((raw) => raw === 'true'),
    TRUST_PROXY_HOPS: lenientInt(0, 1),
    // Base del magic link y del issuer OAuth: obligatoria en todos los entornos.
    APP_URL: required('APP_URL'),
    EMAIL_TRANSPORT: z.enum(['dev', 'resend']).default('dev'),
    RESEND_API_KEY: optionalText,
    EMAIL_FROM: optionalText,
    OPENFIGI_API_KEY: optionalText,
    STRIPE_SECRET_KEY: optionalText,
    // Crons: crudos (o ausentes); los defectos y el valor `off` los aplica `scheduleFromEnv`.
    PRICE_REFRESH_CRON: optionalText,
    PRICE_INTRADAY_CRON: optionalText,
    OAUTH_REAPER_CRON: optionalText,
    LOGIN_TOKEN_RETENTION_DAYS: lenientInt(1, 30),
    MCP_AUDIT_RETENTION_DAYS: lenientInt(1, 180),
    OAUTH_CLIENT_RETENTION_DAYS: lenientInt(1, 30),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      // Un secreto de desarrollo, o uno corto, en producción permitiría falsificar sesiones.
      if (env.JWT_SECRET === DEV_JWT_SECRET) {
        ctx.addIssue({
          code: 'custom',
          path: ['JWT_SECRET'],
          message: 'usa el valor de desarrollo en producción. Define uno fuerte: openssl rand -base64 48',
        });
      } else if (env.JWT_SECRET.length < MIN_PRODUCTION_JWT_SECRET_LENGTH) {
        ctx.addIssue({
          code: 'custom',
          path: ['JWT_SECRET'],
          message: `debe tener al menos ${MIN_PRODUCTION_JWT_SECRET_LENGTH} caracteres en producción (openssl rand -base64 48)`,
        });
      }
      // Sin `Secure`, la cookie de sesión viajaría en claro por cualquier petición http.
      if (!env.COOKIE_SECURE) {
        ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'debe ser "true" en producción' });
      }
      // Es la base del magic link y el issuer OAuth: en http, el enlace y los tokens irían en claro.
      if (!env.APP_URL.startsWith('https://')) {
        ctx.addIssue({ code: 'custom', path: ['APP_URL'], message: 'debe empezar por https:// en producción' });
      }
    }
    // Sin remitente por defecto: el dominio de envío es propio de cada despliegue, y más vale
    // enterarse al arrancar que cuando un usuario intenta entrar.
    if (env.EMAIL_TRANSPORT === 'resend') {
      if (!env.RESEND_API_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['RESEND_API_KEY'],
          message: 'es obligatoria con EMAIL_TRANSPORT=resend (o usa EMAIL_TRANSPORT=dev en desarrollo)',
        });
      }
      if (!env.EMAIL_FROM) {
        ctx.addIssue({
          code: 'custom',
          path: ['EMAIL_FROM'],
          message:
            'es obligatoria con EMAIL_TRANSPORT=resend: un remitente de un dominio verificado en Resend ' +
            '(p. ej. "Sextante <no-reply@send.tu-dominio>")',
        });
      }
    }
  });

/** Configuración ya validada y tipada: lo que devuelve `ConfigService<Env, true>`. */
export type Env = z.output<typeof appEnvSchema>;

function formatIssues(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const name = issue.path.join('.');
    return name ? `  - ${name}: ${issue.message}` : `  - ${issue.message}`;
  });
  return `Configuración de entorno inválida:\n${lines.join('\n')}`;
}

/** Valida el entorno contra el esquema completo; lanza con todos los fallos juntos. */
export function parseEnv(raw: Record<string, unknown>): Env {
  const result = appEnvSchema.safeParse(blankToUndefined(raw));
  if (!result.success) throw new Error(formatIssues(result.error));
  return result.data;
}

/** Subconjunto para el migrador: valida solo `DATABASE_URL`, sin exigir el resto de la API. */
export function parseDatabaseEnv(raw: Record<string, unknown>): Pick<Env, 'DATABASE_URL'> {
  const result = databaseEnvSchema.safeParse(blankToUndefined(raw));
  if (!result.success) throw new Error(formatIssues(result.error));
  return result.data;
}
