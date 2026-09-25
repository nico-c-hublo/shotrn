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

function admitted(admission: Admission) {
  if (!admission.admitted) throw new Error('expected the lookup to be admitted');
  return admission;
}

/** One complete lookup: admitted, then settled as a hit or a miss. */
function lookup(limiter: UnknownCodeLimiter, client: string, missed: boolean): void {
  admitted(limiter.admit(client)).settle(missed);
}

describe('UnknownCodeLimiter', () => {
  it('refuses a client once its misses reach the limit', () => {
    const { limiter } = setup();
    for (let i = 0; i < LIMIT; i++) lookup(limiter, 'a', true);

    expect(limiter.admit('a')).toEqual({ admitted: false, retryAfterSeconds: 600 });
  });

  it('restores the budget when the window ends', () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < LIMIT; i++) lookup(limiter, 'a', true);

    advance(WINDOW_MS - 1000);
    expect(limiter.admit('a')).toEqual({ admitted: false, retryAfterSeconds: 1 });
    advance(1000);
    expect(limiter.admit('a').admitted).toBe(true);
  });

  it('measures the window from the first miss, not from the refusal', () => {
    const { limiter, advance } = setup();
    lookup(limiter, 'a', true);
    advance(4 * 60 * 1000);
    lookup(limiter, 'a', true);
    lookup(limiter, 'a', true);

    expect(limiter.admit('a')).toEqual({ admitted: false, retryAfterSeconds: 360 });
  });

  it('never charges a lookup that found its link', () => {
    const { limiter } = setup();
    for (let i = 0; i < 100; i++) lookup(limiter, 'a', false);
    for (let i = 0; i < LIMIT; i++) lookup(limiter, 'a', true);

    expect(limiter.admit('a').admitted).toBe(false);
  });

  it('keeps clients apart', () => {
    const { limiter } = setup();
    for (let i = 0; i < LIMIT; i++) lookup(limiter, 'a', true);

    expect(limiter.admit('b').admitted).toBe(true);
  });

  // The attack this closes: fire many guesses at once so all pass the check before any
  // of them is known to be a miss.
  it('counts lookups still in flight, so concurrent guesses cannot overrun the budget', () => {
    const { limiter } = setup();
    const pending = Array.from({ length: LIMIT }, () => admitted(limiter.admit('a')));

    expect(limiter.admit('a')).toEqual({ admitted: false, retryAfterSeconds: 1 });

    pending.forEach((admission) => admission.settle(true));
    expect(limiter.admit('a')).toEqual({ admitted: false, retryAfterSeconds: 600 });
  });

  it('gives a hit its reservation back', () => {
    const { limiter } = setup();
    const pending = Array.from({ length: LIMIT }, () => admitted(limiter.admit('a')));
    pending.forEach((admission) => admission.settle(false));

    expect(limiter.admit('a').admitted).toBe(true);
  });

  it('ignores a second settlement of the same lookup', () => {
    const { limiter } = setup();
    const admission = admitted(limiter.admit('a'));
    admission.settle(true);
    admission.settle(true);
    admission.settle(true);

    expect(limiter.admit('a').admitted).toBe(true);
  });

  it('forgets idle clients so the table cannot grow without bound', () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 1000; i++) lookup(limiter, `client-${i}`, true);
    lookup(limiter, 'hit-only', false);
    expect(limiter.trackedClients).toBe(1000);

    advance(WINDOW_MS);
    limiter.admit('trigger-sweep');
    expect(limiter.trackedClients).toBe(1);
  });
});
