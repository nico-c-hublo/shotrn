import { createTestApp, type TestApp } from '../setup/app';
import { LinksRepository } from '../../src/links/links.repository';
import { generateCode } from '../../src/links/short-code';

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

  // FR-005 / SC-004
  it('stores 10,000 concurrent inserts under 10,000 distinct codes', async () => {
    const inserts = Array.from({ length: 10_000 }, (_, i) =>
      repository.insert({
        code: generateCode(),
        originalUrl: `https://example.com/${i}`,
        expiresAt: null,
      }),
    );
    const rows = await Promise.all(inserts);
    expect(rows.every((row) => row !== null)).toBe(true);
    expect(new Set(rows.map((row) => row?.code)).size).toBe(10_000);
  });

  // The primary key, not application logic, is what makes a clash impossible to store.
  it('refuses a code that is already taken without touching the existing link', async () => {
    const code = generateCode();
    await repository.insert({ code, originalUrl: 'https://example.com/first', expiresAt: null });

    const clash = await repository.insert({
      code,
      originalUrl: 'https://example.com/second',
      expiresAt: null,
    });

    expect(clash).toBeNull();
    expect((await repository.findByCode(code))?.originalUrl).toBe('https://example.com/first');
  });

  it('settles concurrent inserts of one code with exactly one winner', async () => {
    const code = generateCode();
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        repository.insert({ code, originalUrl: `https://example.com/${i}`, expiresAt: null }),
      ),
    );
    expect(results.filter((row) => row !== null)).toHaveLength(1);
  });

  // Case-sensitive (FR-006) and byte-order: codes differing only in case are distinct keys.
  it('keeps codes that differ only in case apart', async () => {
    await repository.insert({
      code: 'abcdefghijklm',
      originalUrl: 'https://a.example/',
      expiresAt: null,
    });
    await repository.insert({
      code: 'ABCDEFGHIJKLM',
      originalUrl: 'https://b.example/',
      expiresAt: null,
    });

    expect((await repository.findByCode('abcdefghijklm'))?.originalUrl).toBe('https://a.example/');
    expect((await repository.findByCode('ABCDEFGHIJKLM'))?.originalUrl).toBe('https://b.example/');
  });

  // Defence in depth: the database refuses a code the application could never issue.
  it.each(['short', 'abcdefghijklmn', 'abcdefghijkl-'])(
    'rejects the malformed code %p',
    async (code) => {
      await expect(
        repository.insert({ code, originalUrl: 'https://example.com/', expiresAt: null }),
      ).rejects.toThrow();
    },
  );

  // FR-014
  it('keeps links readable after the connection pool reconnects', async () => {
    const code = generateCode();
    await repository.insert({ code, originalUrl: 'https://example.com/durable', expiresAt: null });

    // Terminate every other backend connection: the pool must transparently reconnect.
    await ctx.pool.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND datname = current_database()',
    );

    const found = await repository.findByCode(code);
    expect(found?.originalUrl).toBe('https://example.com/durable');
  });

  it('stores the original url verbatim, including case and fragment', async () => {
    const code = generateCode();
    const original = 'HTTPS://Example.COM/Path?Q=1#Frag';
    await repository.insert({ code, originalUrl: original, expiresAt: null });
    const found = await repository.findByCode(code);
    expect(found?.originalUrl).toBe(original);
  });
});
