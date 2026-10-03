import { z } from 'zod';

/** Development secret (the one in `.env.example` and `docker-compose.yml`): forbidden in production. */
export const DEV_JWT_SECRET = 'dev_insecure_secret_change_me';

/** Minimum `JWT_SECRET` length in production: 32 characters (HS256 requires a key of at least 256 bits). */
export const MIN_PRODUCTION_JWT_SECRET_LENGTH = 32;

/**
 * Compose passes `VAR: ${VAR:-}`, so an "unset" variable arrives as `""`. It is treated as absent
 * (as the old `?.trim() || DEFAULT` did) so that the default applies.
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

const required = (name: string) => z.string({ error: `${name} is required` });

/**
 * Lenient integer: absent, non-numeric or below `min` falls back to the default instead of failing.
 * This is deliberate: a typo in `TRUST_PROXY_HOPS` must not trust the whole `X-Forwarded-For`, nor
 * one in a retention setting turn into an aggressive deletion. Keeps the semantics of `parseInt`.
 */
const lenientInt = (min: number, fallback: number) =>
  z
    .string()
    .optional()
    .transform((raw) => {
      const parsed = Number.parseInt(raw?.trim() ?? '', 10);
      return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
    });

/** Optional text with surrounding whitespace trimmed (API keys, sender, crons). */
const optionalText = z.string().trim().optional();

/** All the one-shot migrator (`db/migrate.ts`) needs; it runs without Nest. */
const databaseEnvSchema = z.object({
  DATABASE_URL: required('DATABASE_URL'),
});

const appEnvSchema = z
  .object({
    ...databaseEnvSchema.shape,
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    // Not trimmed: a stray space would change the signature of sessions already issued.
    JWT_SECRET: required('JWT_SECRET'),
    // Strict `=== 'true'`: any other value (including "TRUE" or "1") is `false`.
    COOKIE_SECURE: z
      .string()
      .optional()
      .transform((raw) => raw === 'true'),
    TRUST_PROXY_HOPS: lenientInt(0, 1),
    // Base URL of the magic link and the OAuth issuer: required in every environment.
    APP_URL: required('APP_URL'),
    EMAIL_TRANSPORT: z.enum(['dev', 'resend']).default('dev'),
    RESEND_API_KEY: optionalText,
    EMAIL_FROM: optionalText,
    OPENFIGI_API_KEY: optionalText,
    STRIPE_SECRET_KEY: optionalText,
    // Crons: raw (or absent); `scheduleFromEnv` applies the defaults and the `off` value.
    PRICE_REFRESH_CRON: optionalText,
    PRICE_INTRADAY_CRON: optionalText,
    OAUTH_REAPER_CRON: optionalText,
    LOGIN_TOKEN_RETENTION_DAYS: lenientInt(1, 30),
    MCP_AUDIT_RETENTION_DAYS: lenientInt(1, 180),
    OAUTH_CLIENT_RETENTION_DAYS: lenientInt(1, 30),
    // Postgres pool (`db/database.module.ts`). A 0 for the idle or statement timeout disables it.
    DB_IDLE_TIMEOUT_SECONDS: lenientInt(0, 30),
    DB_CONNECT_TIMEOUT_SECONDS: lenientInt(1, 10),
    DB_STATEMENT_TIMEOUT_MS: lenientInt(0, 30_000),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      // A development secret, or a short one, in production would allow forging sessions.
      if (env.JWT_SECRET === DEV_JWT_SECRET) {
        ctx.addIssue({
          code: 'custom',
          path: ['JWT_SECRET'],
          message: 'uses the development value in production. Set a strong one: openssl rand -base64 48',
        });
      } else if (env.JWT_SECRET.length < MIN_PRODUCTION_JWT_SECRET_LENGTH) {
        ctx.addIssue({
          code: 'custom',
          path: ['JWT_SECRET'],
          message: `must be at least ${MIN_PRODUCTION_JWT_SECRET_LENGTH} characters long in production (openssl rand -base64 48)`,
        });
      }
      // Without `Secure`, the session cookie would travel in clear text over any http request.
      if (!env.COOKIE_SECURE) {
        ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'must be "true" in production' });
      }
      // It is the base of the magic link and the OAuth issuer: over http, the link and tokens would travel in clear.
      if (!env.APP_URL.startsWith('https://')) {
        ctx.addIssue({ code: 'custom', path: ['APP_URL'], message: 'must start with https:// in production' });
      }
    }
    // No default sender: the sending domain belongs to each deployment, and it is better to find
    // out at startup than when a user tries to sign in.
    if (env.EMAIL_TRANSPORT === 'resend') {
      if (!env.RESEND_API_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['RESEND_API_KEY'],
          message: 'is required with EMAIL_TRANSPORT=resend (or use EMAIL_TRANSPORT=dev in development)',
        });
      }
      if (!env.EMAIL_FROM) {
        ctx.addIssue({
          code: 'custom',
          path: ['EMAIL_FROM'],
          message:
            'is required with EMAIL_TRANSPORT=resend: a sender on a domain verified in Resend ' +
            '(e.g. "Sextante <no-reply@send.your-domain>")',
        });
      }
    }
  });

/** Validated, typed configuration: what `ConfigService<Env, true>` returns. */
export type Env = z.output<typeof appEnvSchema>;

function formatIssues(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const name = issue.path.join('.');
    return name ? `  - ${name}: ${issue.message}` : `  - ${issue.message}`;
  });
  return `Invalid environment configuration:\n${lines.join('\n')}`;
}

/** Validates the environment against the full schema; throws with every failure at once. */
export function parseEnv(raw: Record<string, unknown>): Env {
  const result = appEnvSchema.safeParse(blankToUndefined(raw));
  if (!result.success) throw new Error(formatIssues(result.error));
  return result.data;
}

/** Subset for the migrator: validates only `DATABASE_URL`, without requiring the rest of the API config. */
export function parseDatabaseEnv(raw: Record<string, unknown>): Pick<Env, 'DATABASE_URL'> {
  const result = databaseEnvSchema.safeParse(blankToUndefined(raw));
  if (!result.success) throw new Error(formatIssues(result.error));
  return result.data;
}
