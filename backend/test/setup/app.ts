import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { createApp } from '../../src/main';
import { loadEnv, type Env } from '../../src/config/env';
import { DATABASE_POOL } from '../../src/db/client';

export interface TestApp {
  app: INestApplication;
  env: Env;
  pool: Pool;
  reset(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Boots the real application against the Testcontainers database. Rate limits default to
 * values high enough not to interfere; a suite that tests throttling passes its own.
 */
export async function createTestApp(overrides: Partial<NodeJS.ProcessEnv> = {}): Promise<TestApp> {
  const env = loadEnv({
    ...process.env,
    RATE_LIMIT_CREATE_PER_HOUR: '100000',
    RATE_LIMIT_REDIRECT_PER_MINUTE: '100000',
    RATE_LIMIT_UNKNOWN_CODE_PER_10_MINUTES: '100000',
    ...overrides,
  });

  const app = await createApp(env);
  await app.init();

  const pool = app.get<Pool>(DATABASE_POOL);

  return {
    app,
    env,
    pool,
    async reset() {
      await pool.query('TRUNCATE TABLE links');
    },
    async close() {
      await app.close();
    },
  };
}
