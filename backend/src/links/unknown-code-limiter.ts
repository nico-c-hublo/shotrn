interface Budget {
  misses: number;
  inFlight: number;
  windowEndsAt: number;
  /** Lookups waiting to learn whether those in flight spend the budget. */
  waiters: Array<() => void>;
}

export type Admission =
  | { admitted: true; settle(missed: boolean): void }
  | { admitted: false; retryAfterSeconds: number };

/**
 * FR-020: how many unknown codes one client may look up per window (research.md §6).
 *
 * A miss is only known after the lookup, so each admitted lookup holds a reservation until
 * it settles: a miss keeps it, a hit gives it back. Counting only settled misses would let
 * a client fire hundreds of concurrent guesses that all pass the check before the first
 * one is recorded. A lookup that could overrun the budget waits for those in flight to
 * settle rather than being refused, so concurrent visitors behind one address lose the
 * length of a lookup, never the lookup itself.
 *
 * Once the budget is spent every lookup is refused, hits included; otherwise guessing would
 * continue and only the refusals would stop. In memory and per instance, like the
 * throttler's own store.
 */
export class UnknownCodeLimiter {
  private readonly budgets = new Map<string, Budget>();
  private nextSweepAt = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async admit(client: string): Promise<Admission> {
    for (;;) {
      const now = this.now();
      this.sweep(now);

      const budget = this.budgetOf(client);
      if (budget.windowEndsAt <= now) budget.misses = 0;

      if (budget.misses >= this.limit) {
        const retryAfterSeconds = Math.max(1, Math.ceil((budget.windowEndsAt - now) / 1000));
        return { admitted: false, retryAfterSeconds };
      }

      if (budget.misses + budget.inFlight < this.limit) return this.reserve(client, budget);

      // Undecided until an in-flight lookup settles. Waiting is bounded by one lookup, and
      // the redirect throttler already caps how many requests one client can have queued.
      await new Promise<void>((resolve) => budget.waiters.push(resolve));
    }
  }

  /** How many clients are currently held in memory. */
  get trackedClients(): number {
    return this.budgets.size;
  }

  private budgetOf(client: string): Budget {
    let budget = this.budgets.get(client);
    if (budget === undefined) {
      budget = { misses: 0, inFlight: 0, windowEndsAt: 0, waiters: [] };
      this.budgets.set(client, budget);
    }
    return budget;
  }

  private reserve(client: string, budget: Budget): Admission {
    budget.inFlight++;
    let settled = false;
    return {
      admitted: true,
      settle: (missed) => {
        if (settled) return;
        settled = true;
        this.settle(client, budget, missed);
      },
    };
  }

  private settle(client: string, budget: Budget, missed: boolean): void {
    budget.inFlight--;
    if (missed) {
      const now = this.now();
      if (budget.windowEndsAt <= now) {
        budget.misses = 0;
        budget.windowEndsAt = now + this.windowMs;
      }
      budget.misses++;
    }

    // Every waiter re-checks: one may now fit, or the budget may be spent for all of them.
    const waiters = budget.waiters.splice(0);
    waiters.forEach((wake) => wake());
    this.forgetIfIdle(client, budget);
  }

  private forgetIfIdle(client: string, budget: Budget): void {
    const idle = budget.inFlight === 0 && budget.waiters.length === 0;
    if (idle && (budget.misses === 0 || budget.windowEndsAt <= this.now())) {
      this.budgets.delete(client);
    }
  }

  /** Drops idle clients whose window has ended, at most once per window. */
  private sweep(now: number): void {
    if (now < this.nextSweepAt) return;
    this.nextSweepAt = now + this.windowMs;
    for (const [client, budget] of this.budgets) this.forgetIfIdle(client, budget);
  }
}
