# Research: URL Shortener

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-09-22

All `NEEDS CLARIFICATION` items from the Technical Context are resolved below.

## 1. Unique ID generation & scalability

**Decision**: PostgreSQL identity column (`id BIGINT GENERATED ALWAYS AS IDENTITY`) on
the `links` table is the sole counter. The short code is `sqids.encode([id])`; it is
**not stored**. Redirect resolves `sqids.decode(code)` → `id` → PK lookup, then
re-encodes and compares to reject non-canonical inputs.

**Rationale**:
- Uniqueness is guaranteed by the database, so SC-004 (zero collisions) holds by
  construction with no application logic.
- Postgres sequences are non-transactional and lock-free: N backend instances
  share one sequence with no coordination and no gaps except on rollback.
- One round-trip per create (`INSERT … RETURNING id`); redirects are PK lookups.
- Write ceiling of a single primary is in the thousands/s vs. a 50/s requirement;
  redirect ceiling (1,000/s) is a read problem solved by pooling and, later,
  replicas or an in-process cache — not by the ID scheme.

**Scaling path (documented, not built)**:
1. *Now*: identity column, `pg` pool (10–20 connections), no cache.
2. *Reads outgrow one node*: add a bounded in-process LRU keyed by `id` for
   unexpired permanent links (they never change); then read replicas.
3. *Writes outgrow one primary*: swap `IdGenerator` for a range allocator — each
   instance calls `nextval` with the sequence's `CACHE` raised (or reserves a block
   `[n, n+1000)` at boot) and hands ids out from memory. Schema and API unchanged;
   only `links.repository.ts`'s insert path changes. Gaps on restart are acceptable
   (id space is 5.7×10¹⁰ at 6 chars).
4. *Storage outgrows one primary*: shard by id range; the code still decodes to the
   id, and the id range identifies the shard. Still no schema change to the code
   format.

**Alternatives considered**:
- *Snowflake-style ids* — no central counter, but 64-bit values encode to ~11 chars,
  breaching the 10-char cap (FR-006). Rejected.
- *Redis `INCR`* — extra stateful infrastructure with its own durability story
  (FR-014). Rejected under Simplicity First.
- *Random codes with retry on collision* — probabilistic uniqueness, needs a stored
  `code` column + unique index + retry loop, and collision probability grows with
  volume. Rejected: more code for a weaker guarantee.
- *Range allocation from day one* — no benefit until the insert itself is sharded;
  adds restart-gap handling. Deferred (step 3 above).

## 2. Sqids configuration

**Decision**: `new Sqids({ alphabet: process.env.SQIDS_ALPHABET, minLength: 6,
blocklist: [...defaultBlocklist, 'assets', 'preview'] })`. The alphabet is a
deployment-specific shuffle of `[0-9A-Za-z]` (62 chars), supplied via environment.

**Rationale**:
- `minLength: 6` yields 6-char codes immediately (SC-008) and grows automatically.
- Shuffled alphabet makes codes non-sequential to a casual observer (FR-007). Sqids
  is **obfuscation, not encryption** — anyone with the alphabet can enumerate.
  Mitigation: redirect-path rate limiting and cheap 404s; no sensitive data behind a
  code anyway (the original URL is public by design).
- Changing the alphabet after launch breaks every issued link, so it is treated as a
  secret-like config value: set once, never rotated, redacted from logs.
- Sqids' default blocklist avoids profanity; `assets`/`preview` are added so a code
  can never collide with a reserved first path segment ≥ 6 chars. Segments shorter
  than `minLength` (`api`, `p`) cannot collide.
- Sqids numbers must be ≤ `Number.MAX_SAFE_INTEGER` (2⁵³). `pg` returns `BIGINT` as
  a string; convert with `Number()` after asserting it is a safe integer. 2⁵³ links
  is far beyond the 10-char cap anyway.

**Alternatives considered**: Hashids (predecessor, unmaintained; Sqids is the
successor). Base62 of the raw id — trivially enumerable, fails FR-007.

## 3. Database: PostgreSQL 16

**Decision**: PostgreSQL 16, single `links` table, `TIMESTAMPTZ` for timestamps.

**Rationale**: `INSERT … RETURNING` (one round-trip), timezone-aware timestamps for
expiry (spec edge case: expiry from server clock), identity sequences.

**Alternatives considered**: MySQL 8 — viable; `AUTO_INCREMENT` requires
`LAST_INSERT_ID()` follow-up in most drivers and `DATETIME` is timezone-naive. User
chose Postgres.

## 4. Redirect semantics & caching

**Decision**:
- Permanent link → `301 Moved Permanently`, `Cache-Control: public, max-age=86400`.
- Temporary link → `302 Found`, `Cache-Control: no-store`.
- Unknown code → `404` with the SPA "not found" page (HTML).
- Expired code → `410 Gone` with the SPA "expired" page (HTML).

**Rationale**: Spec assumption "permanent links cacheable, temporary not". `410`
distinguishes expired from unknown for clients while the HTML page is the same
component with different copy. Browsers cache `301` aggressively; that is acceptable
because permanent links are never changed or deleted in v1.

## 5. Preview mechanism

**Decision**: Preview is a page at `/p/:code` (SPA) backed by
`GET /api/links/:code` (JSON: `originalUrl`, `createdAt`, `expiresAt`, `status`).

**Rationale**: The bit.ly-style `code+` suffix requires a `+` route pattern that
Express/path-to-regexp handles inconsistently across versions. A reserved prefix is
unambiguous, needs no special routing, and satisfies spec US4 ("or using a preview
page"). Expired/unknown codes return the same 404/410 status from the JSON endpoint
so the page shows the same state as a direct visit.

## 6. Rate limiting

**Decision**: `@nestjs/throttler`, keyed by client IP (`trust proxy` enabled for the
HTTPS proxy), in-memory store.
- `POST /api/links`: 60 per hour per IP.
- `GET /:code` and `GET /api/links/:code`: 600 per minute per IP.
- Exceeding → `429` with `{ error: { code: 'RATE_LIMITED', message } }` and
  `Retry-After`.

**Rationale**: Spec FR-015 + assumption (60/h). In-memory store is per-instance; with N
instances the effective limit is N× — acceptable for v1 abuse control and avoids a
shared store. Redirect limit is high enough that a shared link in a chat room does
not trip it, low enough to make enumeration slow.

Production limits are deliberately below the SC-003 load target (1,000 redirects/s):
the load check raises `RATE_LIMIT_REDIRECT_PER_MINUTE` via environment so it measures
the service rather than the limiter (tasks T076). Production abuse control is unchanged.

**Alternatives considered**: Redis-backed throttler storage — deferred with the same
reasoning as the Redis counter. Raising the production redirect ceiling to satisfy the
load test was rejected: it makes enumeration ~10× cheaper and weakens the FR-007
mitigation.

## 7. URL validation rules

**Decision**: In `url-validation.ts`, applied via a `class-validator` custom decorator
on the DTO:
1. Trim; reject empty.
2. Reject if length > 2048.
3. `new URL(value)` — reject on throw.
4. `protocol` must be `http:` or `https:`.
5. `hostname` (lower-cased) must not equal the service's own host from `BASE_URL`.
6. Store `value` (trimmed original string), not `url.href`, to preserve the exact
   input incl. fragment (FR-008). Redirect uses the stored string verbatim.

**Private/loopback range rejection** (constitution: MAY): **not in v1**. Doing it
properly requires DNS resolution on the write path (a hostname can resolve to a
private IP) and re-checking on read (DNS rebinding); a literal-IP check alone gives
false confidence. Recorded as a follow-up if the deployment is internet-facing and
sits next to internal services.

## 8. Dependencies — justification per Principle I

| Dependency | Why | Simpler alternative rejected because |
|---|---|---|
| NestJS | User-mandated; DI, validation pipe, throttler, exception filters out of the box | — |
| `sqids` | User-suggested; exact fit for encode/decode of a counter | Hand-rolled base62 fails FR-007 |
| Drizzle ORM + drizzle-kit | Typed schema, generated SQL migrations (constitution: versioned migrations) | Raw `pg` + hand-written migrations needs a bespoke migration runner and untyped rows; more code to own than Drizzle's ~zero-runtime layer. Prisma/TypeORM rejected as heavier (codegen/decorator magic) for one table. |
| `pg` | Postgres driver (Drizzle peer) | — |
| `class-validator` + `class-transformer` | Nest-idiomatic DTO validation with `whitelist` stripping | Zod pipe is comparable; class-validator chosen for zero custom pipe code and Nest docs alignment |
| `@nestjs/throttler` | FR-015 rate limiting | Hand-rolled token bucket is ~the same size but untested |
| `helmet` | Constitution: baseline security headers | Setting 5 headers by hand is fine too; helmet is the audited default |
| `@nestjs/serve-static` | Serve SPA in prod from same origin | Separate static host complicates same-origin `/:code` routing |
| React 19 + Vite 6 | User-mandated frontend | — |
| Jest + Supertest | Nest default test stack; contract tests over HTTP | Vitest on backend requires SWC decorator config — not worth two configs |
| Vitest + Testing Library | Vite-native frontend tests | — |
| `@testcontainers/postgresql` | Constitution IV: one command, no manually provisioned state | `pg-mem` is not Postgres-faithful (identity, TIMESTAMPTZ); docker-compose-managed test DB is "manually provisioned state" |
| ESLint (typescript-eslint) + Prettier | Constitution II: tooling-enforced quality | — |

## 9. Frontend routing without a router

**Decision**: `App.tsx` reads `window.location.pathname`: `/` → shorten screen;
`/p/:code` → preview screen; anything else is never served the SPA (backend redirects
or 404s before the SPA is involved). No React Router.

**Rationale**: Two screens; a router adds a dependency and a mental model for nothing.

## 10. Expiry options

**Decision**: `ExpiryOption = '1h' | '1d' | '7d' | '30d' | 'never'`, server computes
`expiresAt = now + duration` (server clock) or `null`. Stored absolute; response
returns ISO-8601 with timezone. Frontend displays in visitor's local time.

**Rationale**: Fixed enum keeps validation trivial and matches FR-011; absolute
storage matches the edge case on wrong client clocks.

## 11. Expired-link retention

**Decision**: No purge job in v1. Expired rows stay so `410` can be served (spec
assumption ≥ 30 days). A purge (`DELETE WHERE expires_at < now() - interval '30 days'`)
is a one-line operational cron to add when volume warrants.
