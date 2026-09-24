import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Pool } from 'pg';
import { ENV, loadEnv, type Env } from './config/env';
import { createDatabase, createPool, DATABASE, DATABASE_POOL } from './db/client';
import { LinksModule } from './links/links.module';

export interface AppModuleOptions {
  env?: Env;
}

@Module({})
export class AppModule {
  static register(options: AppModuleOptions = {}): DynamicModule {
    const env = options.env ?? loadEnv();

    const envProvider = { provide: ENV, useValue: env };
    const poolProvider = {
      provide: DATABASE_POOL,
      useFactory: () => createPool(env.databaseUrl),
    };
    const databaseProvider = {
      provide: DATABASE,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool) => createDatabase(pool),
    };

    return {
      module: AppModule,
      global: true,
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [
            // FR-015. Named throttlers let the redirect path stay generous while creation
            // stays tight; exceeding one never blocks the other.
            { name: 'create', ttl: 60 * 60 * 1000, limit: env.rateLimitCreatePerHour },
            { name: 'redirect', ttl: 60 * 1000, limit: env.rateLimitRedirectPerMinute },
          ],
        }),
        LinksModule,
      ],
      providers: [
        envProvider,
        poolProvider,
        databaseProvider,
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
      exports: [ENV, DATABASE, DATABASE_POOL],
    };
  }
}
