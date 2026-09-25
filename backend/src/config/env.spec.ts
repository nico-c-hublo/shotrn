import { EnvValidationError, loadEnv } from './env';

const base: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgres://app:sup3rs3cret@localhost:5432/shotrn',
  BASE_URL: 'http://localhost:3000',
};

describe('loadEnv', () => {
  it('accepts a complete configuration and applies defaults', () => {
    const env = loadEnv({ ...base });
    expect(env.port).toBe(3000);
    expect(env.rateLimitCreatePerHour).toBe(60);
    expect(env.rateLimitRedirectPerMinute).toBe(600);
    expect(env.rateLimitUnknownCodePer10Minutes).toBe(20);
    expect(env.baseHostname).toBe('localhost');
  });

  it('strips a trailing slash from BASE_URL so short URLs never double up', () => {
    expect(loadEnv({ ...base, BASE_URL: 'https://sho.rt/' }).baseUrl).toBe('https://sho.rt');
  });

  it.each(['DATABASE_URL', 'BASE_URL'])('fails when %s is missing', (name) => {
    const source = { ...base };
    delete source[name];
    expect(() => loadEnv(source)).toThrow(EnvValidationError);
  });

  it('rejects a non-positive rate limit', () => {
    expect(() => loadEnv({ ...base, RATE_LIMIT_CREATE_PER_HOUR: '0' })).toThrow(/positive integer/);
  });

  // FR-017 / constitution III: a configuration failure must not echo secret values.
  it('never includes secret values in the error message', () => {
    const source = { ...base, BASE_URL: 'not-a-url-but-secret' };
    try {
      loadEnv(source);
      fail('expected loadEnv to throw');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain('not-a-url-but-secret');
      expect(message).not.toContain('sup3rs3cret');
      expect(message).toContain('BASE_URL');
    }
  });
});
