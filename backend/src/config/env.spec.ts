import { EnvValidationError, loadEnv } from './env';

const base: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgres://app:sup3rs3cret@localhost:5432/shotrn',
  PUBLIC_BASE_URL: 'http://localhost:3000',
};

describe('loadEnv', () => {
  it('accepts a complete configuration and applies defaults', () => {
    const env = loadEnv({ ...base });
    expect(env.port).toBe(3000);
    expect(env.rateLimitCreatePerHour).toBe(60);
    expect(env.rateLimitRedirectPerMinute).toBe(600);
    expect(env.baseHostname).toBe('localhost');
  });

  it('strips a trailing slash from PUBLIC_BASE_URL so short URLs never double up', () => {
    expect(loadEnv({ ...base, PUBLIC_BASE_URL: 'https://sho.rt/' }).baseUrl).toBe('https://sho.rt');
  });

  // Vite and Vitest set process.env.BASE_URL to `/`, which is why the variable is not
  // called BASE_URL; theirs must never be mistaken for ours.
  it("ignores Vite's own BASE_URL", () => {
    expect(loadEnv({ ...base, BASE_URL: '/' }).baseUrl).toBe('http://localhost:3000');
  });

  it('points an old configuration at the renamed variable', () => {
    const source: NodeJS.ProcessEnv = { ...base, BASE_URL: 'https://old.example' };
    delete source.PUBLIC_BASE_URL;
    expect(() => loadEnv(source)).toThrow(/BASE_URL was renamed to PUBLIC_BASE_URL/);
    expect(() => loadEnv(source)).not.toThrow(/old\.example/);
  });

  it("gives no rename hint when BASE_URL is only Vite's", () => {
    const source: NodeJS.ProcessEnv = { ...base, BASE_URL: '/' };
    delete source.PUBLIC_BASE_URL;
    expect(() => loadEnv(source)).toThrow(/PUBLIC_BASE_URL is required/);
    expect(() => loadEnv(source)).not.toThrow(/renamed/);
  });

  it.each(['DATABASE_URL', 'PUBLIC_BASE_URL'])('fails when %s is missing', (name) => {
    const source = { ...base };
    delete source[name];
    expect(() => loadEnv(source)).toThrow(EnvValidationError);
  });

  it('rejects a non-positive rate limit', () => {
    expect(() => loadEnv({ ...base, RATE_LIMIT_CREATE_PER_HOUR: '0' })).toThrow(/positive integer/);
  });

  // FR-017 / constitution III: a configuration failure must not echo secret values.
  it('never includes secret values in the error message', () => {
    const source = { ...base, PUBLIC_BASE_URL: 'not-a-url-but-secret' };
    try {
      loadEnv(source);
      expect.unreachable('expected loadEnv to throw');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain('not-a-url-but-secret');
      expect(message).not.toContain('sup3rs3cret');
      expect(message).toContain('PUBLIC_BASE_URL');
    }
  });
});
