import { UnknownCodeLimiter, type Admission } from './unknown-code-limiter';

const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 3;

function setup() {
  let now = 1_000_000;
  const limiter = new UnknownCodeLimiter(LIMIT, WINDOW_MS, () => now);
  const advance = (ms: number) => {
    now += ms;
  };
  return { limiter, advance };
}

async function admitted(pending: Promise<Admission>) {
  const admission = await pending;
  if (!admission.admitted) throw new Error('expected the lookup to be admitted');
  return admission;
}

/** One complete lookup: admitted, then settled as a hit or a miss. */
async function lookup(limiter: UnknownCodeLimiter, client: string, missed: boolean) {
  (await admitted(limiter.admit(client))).settle(missed);
}

/** Resolves on the next macrotask, after every promise that can settle already has. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Starts an admission and reports whether it has decided yet. */
function track(pending: Promise<Admission>) {
  const state: { result?: Admission } = {};
  void pending.then((result) => (state.result = result));
  return state;
}

describe('UnknownCodeLimiter', () => {
  it('refuses a client once its misses reach the limit', async () => {
    const { limiter } = setup();
    for (let i = 0; i < LIMIT; i++) await lookup(limiter, 'a', true);

    expect(await limiter.admit('a')).toEqual({ admitted: false, retryAfterSeconds: 600 });
  });

  it('restores the budget when the window ends', async () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < LIMIT; i++) await lookup(limiter, 'a', true);

    advance(WINDOW_MS - 1000);
    expect(await limiter.admit('a')).toEqual({ admitted: false, retryAfterSeconds: 1 });
    advance(1000);
    expect((await limiter.admit('a')).admitted).toBe(true);
  });

  it('measures the window from the first miss, not from the refusal', async () => {
    const { limiter, advance } = setup();
    await lookup(limiter, 'a', true);
    advance(4 * 60 * 1000);
    await lookup(limiter, 'a', true);
    await lookup(limiter, 'a', true);

    expect(await limiter.admit('a')).toEqual({ admitted: false, retryAfterSeconds: 360 });
  });

  it('never charges a lookup that found its link', async () => {
    const { limiter } = setup();
    for (let i = 0; i < 100; i++) await lookup(limiter, 'a', false);
    for (let i = 0; i < LIMIT; i++) await lookup(limiter, 'a', true);

    expect((await limiter.admit('a')).admitted).toBe(false);
  });

  it('keeps clients apart', async () => {
    const { limiter } = setup();
    for (let i = 0; i < LIMIT; i++) await lookup(limiter, 'a', true);

    expect((await limiter.admit('b')).admitted).toBe(true);
  });

  // The attack this closes: fire many guesses at once so all pass the check before any
  // of them is known to be a miss.
  it('holds a lookup that could overrun the budget until those in flight settle', async () => {
    const { limiter } = setup();
    const inFlight = await Promise.all(
      Array.from({ length: LIMIT }, () => admitted(limiter.admit('a'))),
    );

    const waiting = track(limiter.admit('a'));
    await flush();
    expect(waiting.result).toBeUndefined();

    inFlight.forEach((admission) => admission.settle(true));
    await flush();
    expect(waiting.result).toEqual({ admitted: false, retryAfterSeconds: 600 });
  });

  it('releases every held lookup once the budget is spent, leaving none hanging', async () => {
    const { limiter } = setup();
    const inFlight = await Promise.all(
      Array.from({ length: LIMIT }, () => admitted(limiter.admit('a'))),
    );
    const waiting = Array.from({ length: 5 }, () => track(limiter.admit('a')));

    inFlight.forEach((admission) => admission.settle(true));
    await flush();
    expect(waiting.map((w) => w.result?.admitted)).toEqual(Array(5).fill(false));
  });

  // The legitimate case the wait exists for: concurrent visitors behind one address are
  // delayed by the length of a lookup, never refused.
  it('admits a held lookup as soon as an in-flight one turns out to be a hit', async () => {
    const { limiter } = setup();
    const inFlight = await Promise.all(
      Array.from({ length: LIMIT }, () => admitted(limiter.admit('a'))),
    );

    const waiting = track(limiter.admit('a'));
    inFlight[0].settle(false);
    await flush();
    expect(waiting.result?.admitted).toBe(true);
  });

  it('gives a hit its reservation back', async () => {
    const { limiter } = setup();
    const pending = await Promise.all(
      Array.from({ length: LIMIT }, () => admitted(limiter.admit('a'))),
    );
    pending.forEach((admission) => admission.settle(false));

    expect((await limiter.admit('a')).admitted).toBe(true);
  });

  it('ignores a second settlement of the same lookup', async () => {
    const { limiter } = setup();
    const admission = await admitted(limiter.admit('a'));
    admission.settle(true);
    admission.settle(true);
    admission.settle(true);

    expect((await limiter.admit('a')).admitted).toBe(true);
  });

  it('forgets idle clients so the table cannot grow without bound', async () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 1000; i++) await lookup(limiter, `client-${i}`, true);
    await lookup(limiter, 'hit-only', false);
    expect(limiter.trackedClients).toBe(1000);

    advance(WINDOW_MS);
    await limiter.admit('trigger-sweep');
    expect(limiter.trackedClients).toBe(1);
  });
});
