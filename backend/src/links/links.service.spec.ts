import { loadEnv } from '../config/env';
import type { LinkRow } from '../db/schema';
import type { LinksRepository, NewLink } from './links.repository';
import { LinksService, MAX_CODE_DRAWS } from './links.service';

/** Holds rows in memory and refuses a taken code exactly as the primary key does. */
class FakeRepository {
  readonly rows = new Map<string, LinkRow>();
  lookups = 0;

  async insert(link: NewLink): Promise<LinkRow | null> {
    if (this.rows.has(link.code)) return null;
    const row: LinkRow = { ...link, createdAt: new Date('2026-09-25T00:00:00Z') };
    this.rows.set(link.code, row);
    return row;
  }

  async findByCode(code: string): Promise<LinkRow | null> {
    this.lookups++;
    return this.rows.get(code) ?? null;
  }
}

function serviceWith(codes: string[]) {
  const repository = new FakeRepository();
  const queue = [...codes];
  const generate = vi.fn(() => {
    const code = queue.shift();
    if (code === undefined) throw new Error('test drew more codes than it supplied');
    return code;
  });
  // The fake implements exactly the two methods the service calls.
  const service = new LinksService(repository as unknown as LinksRepository, generate, loadEnv());
  return { service, repository, generate };
}

const TAKEN = 'takenTAKEN123';
const FRESH = 'freshFRESH234';

describe('LinksService', () => {
  describe('create', () => {
    it('draws again when the first code is already taken', async () => {
      const { service, repository, generate } = serviceWith([TAKEN, TAKEN, FRESH]);
      await service.create('https://example.com/first');

      const created = await service.create('https://example.com/second');

      expect(created.code).toBe(FRESH);
      expect(generate).toHaveBeenCalledTimes(3);
      expect(repository.rows.get(TAKEN)?.originalUrl).toBe('https://example.com/first');
    });

    it(`gives up after ${MAX_CODE_DRAWS} clashes instead of looping on a broken source`, async () => {
      const { service, generate } = serviceWith(Array(MAX_CODE_DRAWS + 1).fill(TAKEN));
      await service.create('https://example.com/first');

      await expect(service.create('https://example.com/second')).rejects.toThrow(/clashed/);
      expect(generate).toHaveBeenCalledTimes(MAX_CODE_DRAWS + 1);
    });
  });

  describe('resolve', () => {
    it.each(['', 'short', 'freshFRESH234x', 'fresh-FRESH23'])(
      'answers %j as not found without a lookup',
      async (code) => {
        const { service, repository } = serviceWith([]);
        expect(await service.resolve(code)).toEqual({ outcome: 'not-found' });
        expect(repository.lookups).toBe(0);
      },
    );

    it('looks up a well-formed code', async () => {
      const { service, repository } = serviceWith([FRESH]);
      await service.create('https://example.com/');

      const resolved = await service.resolve(FRESH);

      expect(resolved.outcome).toBe('active');
      expect(repository.lookups).toBe(1);
    });
  });
});
