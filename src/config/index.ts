import path from 'node:path';

import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(5001),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET is too short'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('1d'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET is too short'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  SESSION_COOKIE_NAME: z.string().default('omomoom_session'),
  /** Blank on localhost so the cookie stays host-only. ".omomoom.com" in production. */
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SAMESITE: z.enum(['lax', 'none', 'strict']).optional(),

  APP_URL: z.string().default('http://localhost:3000'),
  API_URL: z.string().default('http://localhost:5001'),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  console.error(`\n❌ Invalid environment variables:\n${details}\n`);
  process.exit(1);
}

const env = parsed.data;

const isProduction = env.NODE_ENV === 'production';

/**
 * The frontend and API sit on different sites once deployed, so the session
 * cookie has to travel cross-site. `none` is the only value browsers send
 * there, and it is only honoured alongside `Secure`, which rules it out over
 * plain HTTP locally. Hence lax in development, none in production, and an
 * override for either.
 */
const cookieSameSite = env.COOKIE_SAMESITE ?? (isProduction ? 'none' : 'lax');

const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isDevelopment: env.NODE_ENV === 'development',
  port: env.PORT,
  apiPrefix: '/api/v1',

  databaseUrl: env.DATABASE_URL,
  corsOrigins: env.CORS_ORIGINS,

  bcryptSaltRounds: env.BCRYPT_SALT_ROUNDS,

  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshSecret: env.JWT_REFRESH_SECRET,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },

  session: {
    ttlDays: env.SESSION_TTL_DAYS,
    cookieName: env.SESSION_COOKIE_NAME,
    cookieDomain: env.COOKIE_DOMAIN,
    sameSite: cookieSameSite,
    secure: cookieSameSite === 'none' || isProduction,
  },

  appUrl: env.APP_URL.replace(/\/$/, ''),
  apiUrl: env.API_URL.replace(/\/$/, ''),

  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    enabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  },

  gemini: {
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL,
    enabled: Boolean(env.GEMINI_API_KEY),
  },

  logLevel: env.LOG_LEVEL,
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
  },
} as const;

export default config;
