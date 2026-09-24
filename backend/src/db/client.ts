import { Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

export const DATABASE = Symbol('DATABASE');
export const DATABASE_POOL = Symbol('DATABASE_POOL');

export function createPool(databaseUrl: string): Pool {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  // Without this listener an idle client dying (database restart, failover, admin
  // termination) raises an unhandled 'error' and takes the whole process down. The pool
  // discards the broken client and reconnects on the next checkout (FR-014).
  pool.on('error', (error) => {
    new Logger('DatabasePool').warn(`idle client error: ${error.message}`);
  });

  return pool;
}

export function createDatabase(pool: Pool): Database {
  return drizzle(pool, { schema });
}
