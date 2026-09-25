interface Budget {
  misses: number;
  inFlight: number;
  windowEndsAt: number;
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
 * one is recorded.
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

  admit(client: string): Admission {
    const now = this.now();
    this.sweep(now);

    const budget = this.budgets.get(client) ?? { misses: 0, inFlight: 0, windowEndsAt: 0 };
    if (budget.windowEndsAt <= now) budget.misses = 0;

    if (budget.misses + budget.inFlight >= this.limit) {
      // Spent misses wait for the window; a budget held by in-flight lookups frees up as
      // soon as they settle.
      const waitMs = budget.misses >= this.limit ? budget.windowEndsAt - now : 1000;
      return { admitted: false, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
    }

    budget.inFlight++;
    this.budgets.set(client, budget);

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

  /** How many clients are currently held in memory. */
  get trackedClients(): number {
    return this.budgets.size;
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
    if (budget.misses === 0 && budget.inFlight === 0) this.budgets.delete(client);
  }

  /** Drops clients with nothing in flight and an expired window, at most once per window. */
  private sweep(now: number): void {
    if (now < this.nextSweepAt) return;
    this.nextSweepAt = now + this.windowMs;
    for (const [client, budget] of this.budgets) {
      if (budget.inFlight === 0 && budget.windowEndsAt <= now) this.budgets.delete(client);
    }
  }
}
