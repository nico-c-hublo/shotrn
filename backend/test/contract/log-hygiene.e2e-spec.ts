import { Logger } from '@nestjs/common';
import request from 'supertest';
import { LinksRepository } from '../../src/links/links.repository';
import { createTestApp, type TestApp } from '../setup/app';

/**
 * Constitution III: logs must not contain secrets. Short codes are bearer secrets, and a
 * destination paired with its code is exactly what they protect, so a failing request must
 * be diagnosable without either reaching the log.
 */
describe('logging a failed request', () => {
  let ctx: TestApp;
  let logged: string;
  let spy: jest.SpyInstance;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
    spy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    spy.mockRestore();
  });

  const server = () => ctx.app.getHttpServer();

  /** Runs `fail` with the links table out of reach, then collects every error log argument. */
  async function withTableHidden(fail: () => Promise<unknown>): Promise<void> {
    await ctx.pool.query('ALTER TABLE links RENAME TO links_hidden');
    try {
      await fail();
    } finally {
      await ctx.pool.query('ALTER TABLE links_hidden RENAME TO links');
    }
    logged = spy.mock.calls
      .flat()
      .map((arg: unknown) => (arg instanceof Error ? `${arg.message}\n${arg.stack}` : String(arg)))
      .join('\n');
  }

  it.each(['/', '/api/links/'])(
    'keeps the code out of the log of a failed %scode',
    async (prefix) => {
      const code = 'Secret0Code13';

      await withTableHidden(() => request(server()).get(`${prefix}${code}`).expect(500));

      expect(logged).not.toContain(code);
      expect(logged).toContain(`GET ${prefix}:code failed`);
      expect(logged).toContain('42P01'); // undefined_table: still diagnosable
    },
  );

  it('keeps the new code and the destination out of the log of a failed create', async () => {
    const destination = 'https://private.example/unlisted-document';
    const insert = jest.spyOn(ctx.app.get(LinksRepository), 'insert'); // calls through
    let drawnCode: string;
    try {
      await withTableHidden(() =>
        request(server()).post('/api/links').send({ url: destination }).expect(500),
      );
      drawnCode = insert.mock.calls[0][0].code; // read before mockRestore() clears it
    } finally {
      insert.mockRestore();
    }

    expect(logged).not.toContain(drawnCode);
    expect(logged).not.toContain('private.example');
    expect(logged).toContain('POST /api/links failed');
    expect(logged).toContain('insert into "links"');
  });
});
