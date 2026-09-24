import request from 'supertest';
import { createTestApp, type TestApp } from '../setup/app';

// FR-015. A tight create limit must not affect redirects or other visitors' reads.
describe('rate limiting', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp({
      RATE_LIMIT_CREATE_PER_HOUR: '5',
      RATE_LIMIT_REDIRECT_PER_MINUTE: '1000',
    });
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('refuses excess creations with 429 and Retry-After, leaving redirects working', async () => {
    const server = ctx.app.getHttpServer();
    const statuses: number[] = [];
    let firstCode = '';

    for (let i = 0; i < 6; i++) {
      const res = await request(server).post('/api/links').send({ url: 'https://example.com/x' });
      statuses.push(res.status);
      if (i === 0) firstCode = res.body.code;
    }

    expect(statuses.filter((s) => s === 201)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(1);

    const limited = await request(server).post('/api/links').send({ url: 'https://example.com/y' });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    // Must reflect the create window (1 hour), not a guessed default.
    expect(Number(limited.headers['retry-after'])).toBe(3600);

    // Redirects are on a separate throttler and remain available.
    await request(server).get(`/${firstCode}`).expect(301);
  });
});
