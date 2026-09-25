import request from 'supertest';
import { LinksRepository } from '../../src/links/links.repository';
import { createTestApp, type TestApp } from '../setup/app';

describe('GET /:code', () => {
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

  const server = () => ctx.app.getHttpServer();
  const create = async (url: string, expiry?: string): Promise<string> => {
    const res = await request(server())
      .post('/api/links')
      .send(expiry ? { url, expiry } : { url })
      .expect(201);
    return res.body.code;
  };

  // FR-008
  it('redirects to the original url verbatim, preserving query and fragment', async () => {
    const original = 'https://example.com/very/long/path?x=1&y=2#frag';
    const code = await create(original);

    const res = await request(server()).get(`/${code}`).expect(301);
    expect(res.headers.location).toBe(original);
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
  });

  it.each([
    'https://example.com/a%2Fb%20c?q=%C3%A9',
    'https://example.com:8443/port/path',
    'https://user@example.com/userinfo',
    'https://example.com/path?a=1&b=2#deep/frag?x',
  ])('round-trips %s byte-for-byte', async (original) => {
    const code = await create(original);
    const res = await request(server()).get(`/${code}`).expect(301);
    expect(res.headers.location).toBe(original);
  });

  // HTTP headers are ASCII (RFC 7230), so a non-ASCII URL is necessarily percent-encoded
  // on the wire. It must still denote exactly the URL that was submitted, and the stored
  // value stays verbatim (FR-008).
  it('preserves a non-ASCII url through the required header encoding', async () => {
    const original = 'https://exämple.com/ünïcode?q=café';
    const code = await create(original);

    const res = await request(server()).get(`/${code}`).expect(301);
    expect(decodeURI(res.headers.location ?? '')).toBe(original);

    const preview = await request(server()).get(`/api/links/${code}`).expect(200);
    expect(preview.body.originalUrl).toBe(original);
  });

  // FR-009
  it('returns 404 with no Location for a code that was never issued', async () => {
    const res = await request(server()).get('/zzzzzzzzzzzzz').expect(404);
    expect(res.headers.location).toBeUndefined();
    expect(res.text).toContain('<div id="root">');
  });

  it.each(['zzzzzz', 'zzzzzzzzzzzzzz', 'zzzzzzzzzzzz-'])(
    'answers the malformed code %p with 404 without querying',
    async (code) => {
      const lookup = jest.spyOn(ctx.app.get(LinksRepository), 'findByCode');
      try {
        const res = await request(server()).get(`/${code}`).expect(404);
        expect(res.headers.location).toBeUndefined();
        expect(lookup).not.toHaveBeenCalled();
      } finally {
        lookup.mockRestore();
      }
    },
  );

  it('treats codes as case-sensitive', async () => {
    const code = await create('https://example.com/case');
    const flipped = [...code]
      .map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()))
      .join('');

    // An all-digit code has no case to flip; with 13 random characters that is ~5e-11.
    if (flipped !== code) await request(server()).get(`/${flipped}`).expect(404);
  });

  // FR-013
  it('uses 302 and no-store for an unexpired temporary link', async () => {
    const code = await create('https://example.com/offer', '1h');
    const res = await request(server()).get(`/${code}`).expect(302);
    expect(res.headers.location).toBe('https://example.com/offer');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('still redirects one second before expiry', async () => {
    const code = await create('https://example.com/soon', '1h');
    await ctx.pool.query("UPDATE links SET expires_at = now() + interval '1 second'");
    const res = await request(server()).get(`/${code}`).expect(302);
    expect(res.headers.location).toBe('https://example.com/soon');
  });

  it('returns 410 with no Location one second after expiry', async () => {
    const code = await create('https://example.com/gone-secret', '1h');
    await ctx.pool.query(
      "UPDATE links SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 second'",
    );

    const res = await request(server()).get(`/${code}`).expect(410);
    expect(res.headers.location).toBeUndefined();
    // FR-013: the expired page must not carry the destination either.
    expect(res.text).not.toContain('gone-secret');
  });

  // Constitution III: baseline security headers on every response.
  it.each(['/zzzzzzzzzzzzz', '/', '/api/links/zzzzzzzzzzzzz'])(
    'sets security headers on %s',
    async (path) => {
      const res = await request(server()).get(path);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    },
  );

  // FR-017
  it('returns a safe INTERNAL envelope when the repository fails', async () => {
    const code = await create('https://example.com/boom');
    // Renamed rather than dropped: every suite shares this database, and a hand-written
    // replacement once came back without the CHECK constraints the repository tests rely on.
    await ctx.pool.query('ALTER TABLE links RENAME TO links_hidden');
    try {
      const res = await request(server()).get(`/${code}`).expect(500);
      expect(res.body).toEqual({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toMatch(/relation|select|stack|\/Users\//i);
    } finally {
      await ctx.pool.query('ALTER TABLE links_hidden RENAME TO links');
    }
  });
});
