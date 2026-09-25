import request from 'supertest';
import { createTestApp, type TestApp } from '../setup/app';

const LONG_URL = 'https://example.com/very/long/path?x=1&y=2#frag';

describe('POST /api/links', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
  });

  const post = (body: object) => request(ctx.app.getHttpServer()).post('/api/links').send(body);

  // FR-001
  it('creates a link with no authentication and returns the full response shape', async () => {
    const res = await post({ url: LONG_URL }).expect(201);

    expect(res.body).toEqual({
      code: expect.stringMatching(/^[0-9A-Za-z]{13}$/),
      shortUrl: `${ctx.env.baseUrl}/${res.body.code}`,
      previewUrl: `${ctx.env.baseUrl}/p/${res.body.code}`,
      originalUrl: LONG_URL,
      createdAt: expect.any(String),
      expiresAt: null,
      status: 'active',
    });
  });

  // FR-002
  it.each([
    'ftp://files.example.com/a',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'example.com/no-scheme',
    'hello world',
  ])('rejects %s', async (url) => {
    const res = await post({ url }).expect(400);
    expect(res.body.error.code).toBe('INVALID_URL');
    expect(JSON.stringify(res.body)).not.toMatch(/stack|sql|\/Users\//i);
  });

  it('rejects an empty or whitespace-only url', async () => {
    await post({ url: '' }).expect(400);
    await post({ url: '   ' }).expect(400);
  });

  // FR-003
  it('accepts a 2048-character url and rejects a 2049-character one, stating the limit', async () => {
    const prefix = 'https://example.com/';
    const at2048 = prefix + 'a'.repeat(2048 - prefix.length);
    await post({ url: at2048 }).expect(201);

    const res = await post({ url: at2048 + 'a' }).expect(400);
    expect(res.body.error.code).toBe('INVALID_URL');
    expect(res.body.error.message).toContain('2048');
  });

  // FR-008: an uppercase scheme is valid and must be stored verbatim, not 500.
  it.each(['HTTPS://example.com/upper', 'HtTp://example.com/mixed'])(
    'accepts %s and stores the scheme case verbatim',
    async (url) => {
      const res = await post({ url }).expect(201);
      expect(res.body.originalUrl).toBe(url);
    },
  );

  // FR-004
  it('rejects a url pointing back at the shortener', async () => {
    const res = await post({ url: `${ctx.env.baseUrl}/abc123` }).expect(400);
    expect(res.body.error.code).toBe('INVALID_URL');
  });

  it('rejects an unknown expiry value and unknown body properties', async () => {
    await post({ url: LONG_URL, expiry: '2h' }).expect(400);
    await post({ url: LONG_URL, sneaky: true }).expect(400);
    await post({}).expect(400);
  });

  // FR-018
  it('never deduplicates: the same url twice yields two different codes', async () => {
    const first = await post({ url: LONG_URL }).expect(201);
    const second = await post({ url: LONG_URL }).expect(201);
    expect(second.body.code).not.toBe(first.body.code);
    expect(second.body.originalUrl).toBe(first.body.originalUrl);
  });

  // FR-007: a code must not be a function of anything an attacker could learn or replay.
  // Under the former Sqids scheme, an emptied table with the same configuration issued the
  // same first code every time.
  it('issues a different code from identical state and configuration', async () => {
    const first = await post({ url: LONG_URL }).expect(201);
    await ctx.reset();
    const second = await post({ url: LONG_URL }).expect(201);
    expect(second.body.code).not.toBe(first.body.code);
  });

  // FR-011, FR-012
  it.each([
    ['1h', 60 * 60 * 1000],
    ['1d', 24 * 60 * 60 * 1000],
    ['7d', 7 * 24 * 60 * 60 * 1000],
    ['30d', 30 * 24 * 60 * 60 * 1000],
  ])('sets an absolute expiry for %s', async (expiry, offsetMs) => {
    const before = Date.now();
    const res = await post({ url: LONG_URL, expiry }).expect(201);
    const expiresAt = new Date(res.body.expiresAt).getTime();

    expect(expiresAt).toBeGreaterThanOrEqual(before + offsetMs - 5_000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + offsetMs + 5_000);
    expect(res.body.status).toBe('active');
  });

  it('treats "never" and an omitted expiry as permanent', async () => {
    const explicit = await post({ url: LONG_URL, expiry: 'never' }).expect(201);
    const implicit = await post({ url: LONG_URL }).expect(201);
    expect(explicit.body.expiresAt).toBeNull();
    expect(implicit.body.expiresAt).toBeNull();
  });

  // Spec scenario 3.5: an expired code is never revived.
  it('issues a new code when a previously expired url is shortened again', async () => {
    const first = await post({ url: LONG_URL, expiry: '1h' }).expect(201);
    await ctx.pool.query(
      "UPDATE links SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 second'",
    );

    const second = await post({ url: LONG_URL }).expect(201);
    expect(second.body.code).not.toBe(first.body.code);
    expect(second.body.status).toBe('active');
  });
});
