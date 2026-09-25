import request from 'supertest';
import { createTestApp, type TestApp } from '../setup/app';

describe('GET /api/links/:code (preview)', () => {
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
  const create = async (url: string, expiry?: string) =>
    (
      await request(server())
        .post('/api/links')
        .send(expiry ? { url, expiry } : { url })
        .expect(201)
    ).body;

  // FR-016
  it('returns metadata without redirecting', async () => {
    const created = await create('https://example.com/destination');
    const res = await request(server()).get(`/api/links/${created.code}`).expect(200);

    expect(res.headers.location).toBeUndefined();
    expect(res.body).toEqual({
      code: created.code,
      shortUrl: created.shortUrl,
      previewUrl: created.previewUrl,
      originalUrl: 'https://example.com/destination',
      createdAt: created.createdAt,
      expiresAt: null,
      status: 'active',
    });
  });

  it('reports expiry for a temporary link', async () => {
    const created = await create('https://example.com/temp', '7d');
    const res = await request(server()).get(`/api/links/${created.code}`).expect(200);
    expect(res.body.expiresAt).toBe(created.expiresAt);
    expect(res.body.status).toBe('active');
  });

  it('returns 404 for an unknown code, matching the redirect path', async () => {
    const res = await request(server()).get('/api/links/zzzzzzzzzzzzz').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.headers.location).toBeUndefined();
  });

  // FR-013: the preview page can say when the link expired, but never where it pointed.
  // A guess that lands on an expired code must learn nothing more than that it existed.
  it('returns 410 with only the code, status and expiry for an expired code', async () => {
    const created = await create('https://example.com/expired-secret', '1h');
    const { rows } = await ctx.pool.query<{ expires_at: Date }>(
      "UPDATE links SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 second' RETURNING expires_at",
    );

    const res = await request(server()).get(`/api/links/${created.code}`).expect(410);
    expect(res.headers.location).toBeUndefined();
    expect(res.body).toEqual({
      code: created.code,
      status: 'expired',
      expiresAt: rows[0].expires_at.toISOString(),
    });
    expect(res.text).not.toContain('expired-secret');
  });
});
