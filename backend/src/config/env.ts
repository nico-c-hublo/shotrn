/**
 * Typed environment schema. Fails fast at boot (constitution III: secrets come from the
 * environment and are never committed, logged, or returned).
 */
export interface Env {
  readonly databaseUrl: string;
  readonly baseUrl: string;
  readonly baseHostname: string;
  readonly port: number;
  readonly sqidsAlphabet: string;
  readonly rateLimitCreatePerHour: number;
  readonly rateLimitRedirectPerMinute: number;
}

export const ENV = Symbol('ENV');

/** The 62 characters a short code may contain (FR-006). */
export const CODE_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

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

function validateAlphabet(alphabet: string, problems: string[]): void {
  if (alphabet === '') return; // already reported as missing
  if (alphabet.length !== CODE_CHARS.length) {
    problems.push(`SQIDS_ALPHABET must be exactly ${CODE_CHARS.length} characters`);
    return;
  }
  if (new Set(alphabet).size !== alphabet.length) {
    problems.push('SQIDS_ALPHABET must not contain duplicate characters');
    return;
  }
  const allowed = new Set(CODE_CHARS);
  if ([...alphabet].some((c) => !allowed.has(c))) {
    problems.push('SQIDS_ALPHABET must be a permutation of [0-9A-Za-z]');
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const problems: string[] = [];

  const databaseUrl = requireString(source, 'DATABASE_URL', problems);
  const baseUrl = requireString(source, 'BASE_URL', problems);
  const sqidsAlphabet = requireString(source, 'SQIDS_ALPHABET', problems);
  validateAlphabet(sqidsAlphabet, problems);

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

  if (problems.length > 0) throw new EnvValidationError(problems);

  return {
    databaseUrl,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    baseHostname,
    port,
    sqidsAlphabet,
    rateLimitCreatePerHour,
    rateLimitRedirectPerMinute,
  };
}
