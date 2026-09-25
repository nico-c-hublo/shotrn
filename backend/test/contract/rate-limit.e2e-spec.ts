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

// Every named throttler applies to every route unless the route skips it, so each path must
// be checked against the other path's limit, not just its own.
describe('throttler isolation', () => {
  let ctx: TestApp;

  afterEach(async () => {
    await ctx.close();
  });

  it('does not count redirects or previews against the create limit', async () => {
    ctx = await createTestApp({
      RATE_LIMIT_CREATE_PER_HOUR: '2',
      RATE_LIMIT_REDIRECT_PER_MINUTE: '1000',
    });
    const server = ctx.app.getHttpServer();
    const { body } = await request(server).post('/api/links').send({ url: 'https://example.com/' });

    for (let i = 0; i < 5; i++) {
      await request(server).get(`/${body.code}`).expect(301);
      await request(server).get(`/api/links/${body.code}`).expect(200);
    }
  });

  it('enforces the redirect limit with a one-minute Retry-After', async () => {
    ctx = await createTestApp({
      RATE_LIMIT_CREATE_PER_HOUR: '1000',
      RATE_LIMIT_REDIRECT_PER_MINUTE: '3',
    });
    const server = ctx.app.getHttpServer();
    const { body } = await request(server).post('/api/links').send({ url: 'https://example.com/' });

    for (let i = 0; i < 3; i++) await request(server).get(`/${body.code}`).expect(301);
    const limited = await request(server).get(`/${body.code}`).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBe(60);

    // Preview is on the redirect tier too, so it cannot be used to bypass enumeration limits.
    for (let i = 0; i < 3; i++) await request(server).get(`/api/links/${body.code}`).expect(200);
    await request(server).get(`/api/links/${body.code}`).expect(429);
  });

  it('leaves the app shell unthrottled', async () => {
    ctx = await createTestApp({
      RATE_LIMIT_CREATE_PER_HOUR: '1',
      RATE_LIMIT_REDIRECT_PER_MINUTE: '1',
    });
    const server = ctx.app.getHttpServer();

    for (let i = 0; i < 3; i++) {
      await request(server).get('/').expect(200);
      await request(server).get('/p/anything').expect(200);
    }
  });

  // Behind the proxy (trust proxy = 1) the client address comes from X-Forwarded-For.
  it('counts every address in one IPv6 /64 as one client', async () => {
    ctx = await createTestApp({
      RATE_LIMIT_CREATE_PER_HOUR: '2',
      RATE_LIMIT_REDIRECT_PER_MINUTE: '1000',
    });
    const server = ctx.app.getHttpServer();
    const createFrom = (ip: string) =>
      request(server)
        .post('/api/links')
        .set('X-Forwarded-For', ip)
        .send({ url: 'https://example.com/' });

    await createFrom('2001:db8:1:2::1').expect(201);
    await createFrom('2001:db8:1:2::2').expect(201);
    await createFrom('2001:db8:1:2:ffff::3').expect(429);

    // A different /64 is a different client.
    await createFrom('2001:db8:1:3::1').expect(201);
  });

  it('does not count creations against the redirect limit', async () => {
    ctx = await createTestApp({
      RATE_LIMIT_CREATE_PER_HOUR: '1000',
      RATE_LIMIT_REDIRECT_PER_MINUTE: '3',
    });
    const server = ctx.app.getHttpServer();

    for (let i = 0; i < 5; i++) {
      await request(server).post('/api/links').send({ url: 'https://example.com/' }).expect(201);
    }
  });
});
