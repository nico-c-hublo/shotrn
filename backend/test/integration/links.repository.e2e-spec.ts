import { createTestApp, type TestApp } from '../setup/app';
import { LinksRepository } from '../../src/links/links.repository';

describe('LinksRepository', () => {
  let ctx: TestApp;
  let repository: LinksRepository;

  beforeAll(async () => {
    ctx = await createTestApp();
    repository = ctx.app.get(LinksRepository);
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(async () => {
    await ctx.reset();
  });

  // FR-005 / SC-004: uniqueness comes from the identity column, so there is no collision
  // handling to test — only the guarantee itself.
  it('issues distinct ids for 10,000 concurrent inserts', async () => {
    const inserts = Array.from({ length: 10_000 }, (_, i) =>
      repository.insert({ originalUrl: `https://example.com/${i}`, expiresAt: null }),
    );
    const rows = await Promise.all(inserts);
    const ids = new Set(rows.map((r) => r.id));
    expect(ids.size).toBe(10_000);
  });

  // FR-014
  it('keeps links readable after the connection pool reconnects', async () => {
    const row = await repository.insert({
      originalUrl: 'https://example.com/durable',
      expiresAt: null,
    });

    // Terminate every other backend connection: the pool must transparently reconnect.
    await ctx.pool.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND datname = current_database()',
    );

    const found = await repository.findById(row.id);
    expect(found?.originalUrl).toBe('https://example.com/durable');
  });

  it('stores the original url verbatim, including case and fragment', async () => {
    const original = 'HTTPS://Example.COM/Path?Q=1#Frag';
    const row = await repository.insert({ originalUrl: original, expiresAt: null });
    const found = await repository.findById(row.id);
    expect(found?.originalUrl).toBe(original);
  });
});
