/**
 * Typed environment schema. Fails fast at boot (constitution III: secrets come from the
 * environment and are never committed, logged, or returned).
 */
export interface Env {
  readonly databaseUrl: string;
  readonly baseUrl: string;
  readonly baseHostname: string;
  readonly port: number;
  readonly rateLimitCreatePerHour: number;
  readonly rateLimitRedirectPerMinute: number;
  readonly rateLimitUnknownCodePer10Minutes: number;
}

export const ENV = Symbol('ENV');

export class EnvValidationError extends Error {
  constructor(problems: string[]) {
    // Names only, never values: an invalid secret must not reach the logs.
    super(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'EnvValidationError';
  }
}

function requireString(source: NodeJS.ProcessEnv, name: string, problems: string[]): string {
  const raw = source[name];
  if (raw === undefined || raw.trim() === '') {
    problems.push(`${name} is required but missing or empty`);
    return '';
  }
  return raw.trim();
}

function requirePositiveInt(
  source: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  problems: string[],
): number {
  const raw = source[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    problems.push(`${name} must be a positive integer`);
    return fallback;
  }
  return parsed;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const problems: string[] = [];

  const databaseUrl = requireString(source, 'DATABASE_URL', problems);
  const baseUrl = requireString(source, 'BASE_URL', problems);

  let baseHostname = '';
  if (baseUrl !== '') {
    try {
      baseHostname = new URL(baseUrl).hostname.toLowerCase();
    } catch {
      problems.push('BASE_URL must be an absolute URL');
    }
  }

  const port = requirePositiveInt(source, 'PORT', 3000, problems);
  const rateLimitCreatePerHour = requirePositiveInt(
    source,
    'RATE_LIMIT_CREATE_PER_HOUR',
    60,
    problems,
  );
  const rateLimitRedirectPerMinute = requirePositiveInt(
    source,
    'RATE_LIMIT_REDIRECT_PER_MINUTE',
    600,
    problems,
  );

  const rateLimitUnknownCodePer10Minutes = requirePositiveInt(
    source,
    'RATE_LIMIT_UNKNOWN_CODE_PER_10_MINUTES',
    20,
    problems,
  );

  if (problems.length > 0) throw new EnvValidationError(problems);

  return {
    databaseUrl,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    baseHostname,
    port,
    rateLimitCreatePerHour,
    rateLimitRedirectPerMinute,
    rateLimitUnknownCodePer10Minutes,
  };
}
