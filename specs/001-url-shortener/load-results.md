# Load Check Results (T076)

**Date**: 2026-09-24 · **Harness**: `backend/test/load/redirect-load.ts`
(`npm run load -w backend`)

## Environment

Local: macOS, Node 26.9.0, PostgreSQL 16 in Docker, single backend instance, client and
server on the same machine. 50 concurrent workers.

**Throttler override**: run with `RATE_LIMIT_REDIRECT_PER_MINUTE=1000000` and
`RATE_LIMIT_CREATE_PER_HOUR=1000000`, so the component under test is the service rather
than the rate limiter. Production defaults (600/min, 60/hour) are unchanged; raising
them to satisfy the load target was rejected because it makes enumeration roughly ten
times cheaper and weakens the FR-007 mitigation (research.md §6).

## Results

| Metric | Target | Measured | Verdict |
|---|---|---|---|
| Redirect throughput (SC-003) | ≥ 1,000/s | **5,531/s** | PASS |
| Redirect p99 latency (SC-002) | < 300 ms | **59 ms** | PASS |
| Redirect p50 latency | — | 7 ms | — |
| Failed redirects (SC-003) | 0 | **0** of 2,000 | PASS |
| Create throughput (SC-003) | ≥ 50/s | **4,004/s** | PASS |
| Failed creates (SC-003) | 0 | **0** of 200 | PASS |

## Reading these numbers

They establish headroom, not a production SLA: client and server shared a machine, so
network latency is absent and both competed for the same CPU. The redirect path is a
decode (pure CPU) plus one primary-key lookup, which is why it is fast; the figures are
consistent with that shape rather than surprising.

The counter is nowhere near being the bottleneck — creates ran 80× above target against
a single identity sequence, which is the evidence behind deferring range allocation
(research.md §1, step 3).

A production measurement should be repeated from separate hosts, with the real proxy in
front and the rate limiter at production values, before any capacity commitment.

## Re-run after the unguessable-code amendment (T095)

**Date**: 2026-09-25 · Same harness, machine and overrides as above. The build under test
has random stored codes (lookup by a text primary key instead of a decoded `BIGINT`) and
the unknown-code guard on both lookup routes. `RATE_LIMIT_UNKNOWN_CODE_PER_10_MINUTES`
was **left at its production default of 20**: the load is all hits, and a guard that
charged hits would show up here as failures. The database was a throwaway
`postgres:16-alpine` container, so no development data was migrated.

| Run | Redirects/s | p50 | p99 | Failed redirects | Creates/s | Failed creates |
|---|---|---|---|---|---|---|
| 1 | 6,470 | 6 ms | 41 ms | 0 of 2,000 | 4,253 | 0 of 200 |
| 2 | 7,064 | 7 ms | 14 ms | 0 of 2,000 | 5,111 | 0 of 200 |
| 3 | 6,552 | 7 ms | 15 ms | 0 of 2,000 | 4,792 | 0 of 200 |

All SC-002/SC-003 targets pass. The figures are in line with the first run: a text key
lookup and a fixed-length format check cost nothing measurable next to the round-trip.
The variation between runs is noise on a shared machine, not an improvement.

**What the first attempt caught.** Before the fix in `4655ae7`, this check failed 732 of
2,000 redirects. The unknown-code limiter refused any lookup beyond the 20 already in
flight for one client, hits included, and the harness sends 50 concurrent requests from
one address. It now holds such a lookup until the in-flight ones settle
(research.md §6), and a contract test sends 50 concurrent hits from one client to keep
it that way.

