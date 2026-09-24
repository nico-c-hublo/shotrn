import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Repo root, whether running from `src` (dev) or `dist` (built). */
const ENV_FILE = join(__dirname, '..', '..', '..', '.env');

/**
 * Loads the repository-root `.env` into `process.env` when it exists.
 *
 * Variables already present win: `process.loadEnvFile` never overwrites them. So real
 * environment variables (production, CI, the Testcontainers suite) always take
 * precedence, and `.env` is only a convenience for local development.
 *
 * Call this before reading any configuration. It is a no-op when the file is absent,
 * which is the normal case outside a developer machine.
 */
export function loadEnvFile(path: string = ENV_FILE): void {
  if (!existsSync(path)) return;
  process.loadEnvFile(path);
}
