import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  PGSSLMODE: z.enum(['disable', 'prefer', 'require']).default('disable'),
  JWT_SECRET: z.string().min(8).default('dev-secret-change-me'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ADMIN_EMAIL: z.string().email().default('owner@example.com'),
  ADMIN_PASSWORD: z.string().min(8).default('ChangeMe123!'),
  CAPTCHA_PROVIDER: z.string().trim().default(''),
  CAPTCHA_SECRET: z.string().trim().default(''),
  APPLE_PASS_TYPE_ID: z.string().trim().default(''),
  APPLE_TEAM_ID: z.string().trim().default(''),
  APPLE_CERT_PATH: z.string().trim().default(''),
  APPLE_CERT_PASSWORD: z.string().trim().default(''),
  APPLE_WWDR_CERT_PATH: z.string().trim().default(''),
  APNS_KEY_PATH: z.string().trim().default(''),
  APNS_KEY_ID: z.string().trim().default(''),
  GOOGLE_WALLET_ISSUER_ID: z.string().trim().default(''),
  GOOGLE_WALLET_SERVICE_ACCOUNT_JSON: z.string().trim().default(''),
  APP_STORE_URL: z.string().url().default('https://apps.apple.com/'),
  PLAY_STORE_URL: z.string().url().default('https://play.google.com/store'),
  ALLOWED_ORIGINS: z.string().trim().default(''),
  BLOCKED_IPS: z.string().trim().default(''),
});

const parsed = envSchema.parse(process.env);

export const config = {
  databaseUrl: parsed.DATABASE_URL ?? '',
  pgSslMode: parsed.PGSSLMODE,
  jwtSecret: parsed.JWT_SECRET,
  jwtExpiresIn: parsed.JWT_EXPIRES_IN,
  port: parsed.PORT,
  nodeEnv: parsed.NODE_ENV,
  adminEmail: parsed.ADMIN_EMAIL,
  adminPassword: parsed.ADMIN_PASSWORD,
  captchaProvider: parsed.CAPTCHA_PROVIDER,
  captchaSecret: parsed.CAPTCHA_SECRET,
  applePassTypeId: parsed.APPLE_PASS_TYPE_ID,
  appleTeamId: parsed.APPLE_TEAM_ID,
  appleCertPath: parsed.APPLE_CERT_PATH,
  appleCertPassword: parsed.APPLE_CERT_PASSWORD,
  appleWwdrCertPath: parsed.APPLE_WWDR_CERT_PATH,
  apnsKeyPath: parsed.APNS_KEY_PATH,
  apnsKeyId: parsed.APNS_KEY_ID,
  googleWalletIssuerId: parsed.GOOGLE_WALLET_ISSUER_ID,
  googleWalletServiceAccountJson: parsed.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON,
  appStoreUrl: parsed.APP_STORE_URL,
  playStoreUrl: parsed.PLAY_STORE_URL,
  allowedOrigins: parsed.ALLOWED_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean),
  blockedIps: parsed.BLOCKED_IPS.split(',').map((item) => item.trim()).filter(Boolean),
} as const;

export type AppConfig = typeof config;
