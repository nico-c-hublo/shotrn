import request from 'supertest';
import { createTestApp, type TestApp } from '../setup/app';

// FR-020. Behind the proxy (trust proxy = 1) the client address comes from X-Forwarded-For.
describe('unknown-code limit', () => {
  let ctx: TestApp;
  let realCode: string;

  beforeEach(async () => {
    ctx = await createTestApp({ RATE_LIMIT_UNKNOWN_CODE_PER_10_MINUTES: '3' });
    const created = await request(server())
      .post('/api/links')
      .send({ url: 'https://example.com/private' })
      .expect(201);
    realCode = created.body.code;
  });
  afterEach(async () => {
    await ctx.close();
  });

  const server = () => ctx.app.getHttpServer();
  const get = (path: string, ip = '203.0.113.1') =>
    request(server()).get(path).set('X-Forwarded-For', ip);

  it('shares one budget between redirect and preview', async () => {
    await get('/zzzzzzzzzzzzz').expect(404);
    await get('/api/links/zzzzzzzzzzzzy').expect(404);
    await get('/zzzzzzzzzzzzw').expect(404);

    const refused = await get('/zzzzzzzzzzzzx').expect(429);
    expect(refused.body).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' },
    });
    expect(Number(refused.headers['retry-after'])).toBe(600);
  });

  // Browsers request /favicon.ico and similar paths on their own. A malformed code is
  // answered without a query, so it reveals nothing and must not cost the visitor anything.
  it('does not charge paths that cannot be codes', async () => {
    for (let i = 0; i < 10; i++) {
      for (const path of ['/favicon.ico', '/robots.txt', '/short', '/api/links/short']) {
        await get(path).expect(404);
      }
    }
    await get(`/${realCode}`).expect(301);
  });

  // Otherwise a guesser keeps guessing and only the refusals stop.
  it('refuses even a real code once the budget is spent', async () => {
    for (const code of ['zzzzzzzzzzzzz', 'zzzzzzzzzzzzy', 'zzzzzzzzzzzzx']) {
      await get(`/${code}`).expect(404);
    }

    const redirect = await get(`/${realCode}`).expect(429);
    expect(redirect.headers.location).toBeUndefined();
    await get(`/api/links/${realCode}`).expect(429);
  });

  it('never charges a lookup that finds its link', async () => {
    for (let i = 0; i < 10; i++) {
      await get(`/${realCode}`).expect(301);
      await get(`/api/links/${realCode}`).expect(200);
    }
    await get('/zzzzzzzzzzzzz').expect(404);
  });

  it('leaves other clients unaffected', async () => {
    for (let i = 0; i < 3; i++) await get('/zzzzzzzzzzzzz').expect(404);
    await get('/zzzzzzzzzzzzz').expect(429);

    await get(`/${realCode}`, '198.51.100.9').expect(301);
    await get('/zzzzzzzzzzzzz', '198.51.100.9').expect(404);
  });

  it('counts every address in one IPv6 /64 as one client', async () => {
    await get('/zzzzzzzzzzzzz', '2001:db8:1:2::1').expect(404);
    await get('/zzzzzzzzzzzzz', '2001:db8:1:2::2').expect(404);
    await get('/zzzzzzzzzzzzz', '2001:db8:1:2:ffff::3').expect(404);

    await get(`/${realCode}`, '2001:db8:1:2::abcd').expect(429);
    await get(`/${realCode}`, '2001:db8:1:3::1').expect(301);
  });

  // Many guesses in flight at once must not all pass the check before any is recorded.
  it('holds concurrent guesses to the budget', async () => {
    // Bound once up front: supertest would otherwise call listen() for every request.
    await ctx.app.listen(0);
    const statuses = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        get(`/zzzzzzzzzzz${String(i).padStart(2, '0')}`).then((res) => res.status),
      ),
    );

    expect(statuses.filter((status) => status === 404)).toHaveLength(3);
    expect(statuses.filter((status) => status === 429)).toHaveLength(17);
  });

  // Found by the load check: refusing lookups merely because others were in flight turned
  // a burst of real visitors behind one address into 429s.
  it('lets concurrent hits from one client through, however many are in flight', async () => {
    await ctx.app.listen(0);
    const statuses = await Promise.all(
      Array.from({ length: 50 }, () => get(`/${realCode}`).then((res) => res.status)),
    );

    expect(statuses).toEqual(Array(50).fill(301));
  });
});
