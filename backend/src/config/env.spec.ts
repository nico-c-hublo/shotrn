import { CODE_CHARS, EnvValidationError, loadEnv } from './env';

const VALID_ALPHABET = [...CODE_CHARS].reverse().join('');

const base: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgres://app:sup3rs3cret@localhost:5432/shotrn',
  BASE_URL: 'http://localhost:3000',
  SQIDS_ALPHABET: VALID_ALPHABET,
};

describe('loadEnv', () => {
  it('accepts a complete configuration and applies defaults', () => {
    const env = loadEnv({ ...base });
    expect(env.port).toBe(3000);
    expect(env.rateLimitCreatePerHour).toBe(60);
    expect(env.rateLimitRedirectPerMinute).toBe(600);
    expect(env.baseHostname).toBe('localhost');
  });

  it('strips a trailing slash from BASE_URL so short URLs never double up', () => {
    expect(loadEnv({ ...base, BASE_URL: 'https://sho.rt/' }).baseUrl).toBe('https://sho.rt');
  });

  it.each(['DATABASE_URL', 'SQIDS_ALPHABET', 'BASE_URL'])('fails when %s is missing', (name) => {
    const source = { ...base };
    delete source[name];
    expect(() => loadEnv(source)).toThrow(EnvValidationError);
  });

  it('rejects an alphabet that is too short', () => {
    expect(() => loadEnv({ ...base, SQIDS_ALPHABET: 'abc' })).toThrow(/exactly 62 characters/);
  });

  it('rejects an alphabet with duplicate characters', () => {
    const dupes = 'a' + VALID_ALPHABET.slice(1);
    expect(() => loadEnv({ ...base, SQIDS_ALPHABET: dupes })).toThrow(/duplicate characters/);
  });

  it('rejects an alphabet containing characters outside [0-9A-Za-z]', () => {
    const withSymbol = '!' + VALID_ALPHABET.slice(1);
    expect(() => loadEnv({ ...base, SQIDS_ALPHABET: withSymbol })).toThrow(/permutation/);
  });

  it('rejects a non-positive rate limit', () => {
    expect(() => loadEnv({ ...base, RATE_LIMIT_CREATE_PER_HOUR: '0' })).toThrow(/positive integer/);
  });

  // FR-017 / constitution III: a configuration failure must not echo secret values.
  it('never includes secret values in the error message', () => {
    const source = { ...base, SQIDS_ALPHABET: 'too-short-but-secret' };
    try {
      loadEnv(source);
      fail('expected loadEnv to throw');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain('too-short-but-secret');
      expect(message).not.toContain('sup3rs3cret');
      expect(message).toContain('SQIDS_ALPHABET');
    }
  });
});
