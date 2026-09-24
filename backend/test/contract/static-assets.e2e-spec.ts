import { existsSync, readdirSync } from 'node:fs';
import request from 'supertest';
import { FRONTEND_ASSETS } from '../../src/links/spa';
import { createTestApp, type TestApp } from '../setup/app';

/**
 * The SPA is useless if its bundles 404: the page renders an empty shell. A route-level
 * test never exercises the static mount, so this guards it directly.
 */
describe('static assets', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const built = existsSync(FRONTEND_ASSETS);
  const whenBuilt = built ? it : it.skip;

  whenBuilt('serves every hashed bundle the built SPA references', async () => {
    const files = readdirSync(FRONTEND_ASSETS).filter((f) => /\.(js|css)$/.test(f));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const res = await request(ctx.app.getHttpServer()).get(`/assets/${file}`).expect(200);
      expect(res.headers['content-type']).toMatch(file.endsWith('.js') ? /javascript/ : /css/);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    }
  });

  it('404s an unknown asset instead of treating it as a short code', async () => {
    await request(ctx.app.getHttpServer()).get('/assets/does-not-exist.js').expect(404);
  });
});
