import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { runMigrations } from '../../src/db/migrate';
import { join } from 'node:path';

declare global {
  var __PG_CONTAINER__: StartedPostgreSqlContainer | undefined;
}

/**
 * Constitution IV: the suite runs with one command and no manually provisioned state.
 * Docker is the only prerequisite.
 */
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('shotrn_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';

  const pool = new Pool({ connectionString: url });
  try {
    await runMigrations(pool, join(__dirname, '..', '..', 'src', 'db', 'migrations'));
  } finally {
    await pool.end();
  }

  globalThis.__PG_CONTAINER__ = container;
}
