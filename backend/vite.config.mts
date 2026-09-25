import { defineConfig } from 'vitest/config';

/**
 * Vitest runs on Vite 8, whose Oxc transform emits the decorator metadata NestJS
 * injection reads. Vite 6's esbuild transform dropped it (research.md §8).
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
          setupFiles: ['./test/setup/unit-env.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/**/*.e2e-spec.ts'],
          globalSetup: ['./test/setup/global-setup.ts'],
          // Every suite shares one database and resets it between tests, so files run
          // one at a time. Starting PostgreSQL can take a while on a cold Docker cache.
          fileParallelism: false,
          testTimeout: 180_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
