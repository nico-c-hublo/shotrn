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
    const res = await request(server()).get('/api/links/zzzzzzzzzzz').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.headers.location).toBeUndefined();
  });

  // An expired link still returns its body so the preview page can explain what happened.
  it('returns 410 with the body still present for an expired code', async () => {
    const created = await create('https://example.com/expired', '1h');
    await ctx.pool.query(
      "UPDATE links SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 second'",
    );

    const res = await request(server()).get(`/api/links/${created.code}`).expect(410);
    expect(res.headers.location).toBeUndefined();
    expect(res.body.originalUrl).toBe('https://example.com/expired');
    expect(res.body.status).toBe('expired');
  });
});
