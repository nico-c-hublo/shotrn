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
