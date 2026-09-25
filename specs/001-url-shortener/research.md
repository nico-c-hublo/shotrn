# Research: URL Shortener

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-09-22

All `NEEDS CLARIFICATION` items from the Technical Context are resolved below.

## 1. Short-code generation

> **Amended 2026-09-25** (constitution 1.1.0). The original decision, a Sqids encoding
> of the identity column, is kept under *Alternatives considered* with the reason it
> was reversed.

**Decision**: Each code is 11 characters drawn independently from `[0-9A-Za-z]` with
`crypto.randomInt(62)` (a CSPRNG with rejection sampling, so no modulo bias). The code
is **stored** and is the table's primary key. Creation inserts with
`ON CONFLICT (code) DO NOTHING RETURNING *`; an empty result means the code was taken,
and the service draws another, up to 3 attempts. Redirect and preview are one
primary-key lookup on the code.

**Rationale**:
- **No secret exists that reveals codes.** A code is not a function of anything:
  not a counter, not a key, not an alphabet. Leaking configuration, logs or the source
  gives an attacker nothing to compute. Only the database itself reveals codes, and
  the database holds the destinations anyway.
- **Guessing is bounded by entropy, which is a length choice.** 62¹¹ ≈ 5.2×10¹⁹
  (~65.5 bits), above the 64-bit floor OWASP sets for session identifiers, which are
  the closest analogue: a bearer secret in a URL. See §2 for the numbers.
- **Collisions are a non-issue, not merely rare.** The chance that a new code is
  already taken is N / 62¹¹: about 2×10⁻¹³ with 10 million links. The same figure is
  an attacker's chance per guess, so a code space where retries are ever observed is
  one that is too small for FR-007. Three consecutive collisions mean the random
  source is broken, and the service fails the request instead of looping.
- **`ON CONFLICT DO NOTHING`** rather than catching a unique violation: no exception,
  no aborted transaction, no error-code parsing, and concurrent inserts of the same
  code are resolved by the unique index itself (SC-004).
- **Cost.** A text key inserted at random positions has worse insert locality than
  an ever-increasing `BIGINT`, and each row carries ~12 more bytes. At the 50
  creates/s target this is invisible; it would matter only at write volumes several
  orders of magnitude higher, where the index would first be partitioned by hash.
  Creation latency is not a constraint (the product owner accepts up to 1 s).

**Scaling path**: codes need no coordination between instances, so any number of
backend instances can create links with no counter to share. Reads scale as before
(pooling, then an in-process LRU for permanent links, then replicas). Storage can be
sharded by hash of the code.

**Alternatives considered**:
- *Sqids over the identity column* (the original decision, reversed). Uniqueness by
  construction and no stored code, but the shuffled alphabet can be recovered from a
  modest number of issued codes, since consecutive ids produce related output. After
  that, every link can be listed by encoding 1, 2, 3, … It is obfuscation, which the
  original spec accepted because destinations were assumed public; the amended threat
  model treats them as private.
- *Keyed permutation of the id* (format-preserving encryption or a Feistel network).
  Codes look random and there are no collisions, with no stored column. Rejected:
  the key is a permanent master secret. Anyone who obtains it once can list every
  link forever, and it cannot be rotated without breaking every issued link. It also
  means owning a small-domain block cipher, where the standard FF3 has been broken.
  CPU cost was not the issue: measured at ~10 µs per operation, the same as Sqids.
- *UUID as the code*. 128 bits is 22 base62 characters, twice the length needed.
  Truncating one loses the uniqueness guarantee and leaves this design with less
  entropy per character than drawing characters directly.
- *Keeping a `BIGINT` id as the primary key with a unique index on `code`*. Two
  indexes for one lookup, and an internal id that nothing references. Rejected.

## 2. Code length and alphabet

**Decision**: 11 characters, `[0-9A-Za-z]`, fixed length, case-sensitive. The column
uses `COLLATE "C"` and a `CHECK (code ~ '^[0-9A-Za-z]{11}$')`.

**Rationale**:
- Expected links found by guessing = guesses × N / 62^L. With 1 million links:

  | Length | One IP at the redirect limit (600/min) | 10k IPs at the redirect limit | 10k IPs at the unknown-code limit (§6) |
  |---|---|---|---|
  | 6 | 15/day | 152,000/day | 507/day |
  | 8 | 0.004/day | 40/day | 0.13/day |
  | 10 | ~0 | 0.01/day | ~0 |
  | **11** | ~0 | 0.0002/day | ~6×10⁻⁷/day |

  At 11 characters and 10 million links, 10,000 coordinated clients held to the
  unknown-code limit find about 0.002 links per year (SC-009).
- **Fixed length** keeps the format check a single regular expression and makes every
  reserved first path segment (`api`, `p`, `assets`) impossible to shadow, because
  none is 11 characters long. The Sqids blocklist is no longer needed.
- **`COLLATE "C"`** compares strings byte by byte. The database's default collation
  follows language rules (for example `en_US.UTF-8`), which are slower to compare and
  are not a stable ordering to build a key on: an operating-system locale update can
  change it and silently corrupt a text index. The codes are ASCII identifiers, not
  words, so byte order is the only meaning they have. Equality is case-sensitive under
  both collations, as FR-006 requires.
- No profanity filter: the spec does not require one. At 11 random characters, a
  recognisable word is unlikely and easy to add later as a rejected draw.

**Alternatives considered**: A longer alphabet (adding `-` and `_`, 64 characters)
gains 0.06 bits per character and makes codes harder to read aloud. Rejected.

## 3. Database: PostgreSQL 16

**Decision**: PostgreSQL 16, single `links` table, `TIMESTAMPTZ` for timestamps.

**Rationale**: `INSERT … ON CONFLICT DO NOTHING RETURNING` (one round-trip, collision
reported as an empty result rather than an error), timezone-aware timestamps for
expiry (spec edge case: expiry from server clock), per-column collations.

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

**Expired links** (amended 2026-09-25, FR-013): the 410 body is an
`ExpiredLinkResponse` of `code`, `status: 'expired'` and `expiresAt` only. The
destination, creation time, and short/preview URLs are withheld. The page can still say
when the link expired, and a guessed code that happens to land on an expired link
reveals only that such a link existed. A separate type, rather than `LinkResponse` with
`originalUrl` omitted, makes it a compile error to leak the field again.

## 6. Rate limiting

**Decision**: `@nestjs/throttler`, keyed by client (`trust proxy` enabled for the
HTTPS proxy), in-memory store.
- `POST /api/links`: 60 per hour per client.
- `GET /:code` and `GET /api/links/:code`: 600 per minute per client.
- Unknown-code lookups on those two routes, counted together: 20 per 10 minutes per
  client (FR-020), see below.
- Exceeding → `429` with `{ error: { code: 'RATE_LIMITED', message } }` and
  `Retry-After`.

**Client key** (amended 2026-09-25): an IPv4 address as is; an IPv4-mapped IPv6
address (`::ffff:a.b.c.d`) as its IPv4 form; any other IPv6 address as its /64 prefix.
A single subscriber is routinely delegated a whole /64 (2⁶⁴ addresses), so keying on
the full address would let one client rotate addresses and escape every limit. The
key applies to all three limits, since the same rotation defeats the create limit.
`@nestjs/throttler` has keyed this way by default since 6.7 (`normalizeIp`), so the
dependency floor is raised to 6.7, the prefix is set explicitly so a changed default
cannot loosen it, and the unknown-code limiter reuses the same function. No address
parsing is hand-rolled.

**Unknown-code limit** (amended 2026-09-25): the redirect limit alone allows 864,000
guesses per client per day, which §2 shows is the dominant term. Real visitors almost
never open 20 non-existent codes in 10 minutes, so misses get their own, much tighter
budget, and a client that exhausts it is refused *every* lookup, hits included, until
the window ends. Otherwise the guesses would keep coming and only the refusals would
stop.
- Implemented as a small guard rather than a third `@nestjs/throttler` throttler: the
  throttler counts every request before the handler runs, but a miss is known only
  after the lookup.
- In-flight lookups count against the budget until they settle, and a hit refunds its
  reservation. Without that, a client could fire 600 concurrent guesses that all pass
  the check before any of them is recorded as a miss. A lookup that *could* overrun the
  budget waits for the in-flight ones to settle instead of being refused. The first
  version refused it, and the load check caught the effect: 50 concurrent hits from one
  address turned into 429s. Waiting costs a real visitor the length of one lookup, and
  the redirect throttler already bounds how many requests a client can have queued.
- A browser visit to an unknown code costs two misses (the page load, then the SPA's
  status fetch), so a person gets about ten typos per window.

**Rationale**: Spec FR-015 + assumption (60/h). In-memory store is per-instance; with N
instances the effective limit is N× — acceptable for v1 abuse control and avoids a
shared store. Redirect limit is high enough that a shared link in a chat room does
not trip it, low enough to make enumeration slow.

Production limits are deliberately below the SC-003 load target (1,000 redirects/s):
the load check raises `RATE_LIMIT_REDIRECT_PER_MINUTE` via environment so it measures
the service rather than the limiter (tasks T076). Production abuse control is unchanged.

**Alternatives considered**: Redis-backed throttler storage — deferred: extra stateful
infrastructure with its own durability story, for a limit that is acceptable per
instance in v1.
- *An artificial delay on 404 responses* (tarpit). Rejected: a delay limits latency,
  not throughput. An attacker opens more concurrent connections and loses nothing,
  while every delayed response holds a socket open on the server, which makes the
  delay a cheap way to exhaust it. Raising the production redirect ceiling to satisfy the
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
| *(none for codes)* | `node:crypto` `randomInt` draws each character | `sqids` was removed with the move to random codes (§1); `nanoid` would add a dependency to replace an 11-iteration loop |
| Drizzle ORM + drizzle-kit | Typed schema, generated SQL migrations (constitution: versioned migrations) | Raw `pg` + hand-written migrations needs a bespoke migration runner and untyped rows; more code to own than Drizzle's ~zero-runtime layer. Prisma/TypeORM rejected as heavier (codegen/decorator magic) for one table. |
| `pg` | Postgres driver (Drizzle peer) | — |
| `class-validator` + `class-transformer` | Nest-idiomatic DTO validation with `whitelist` stripping | Zod pipe is comparable; class-validator chosen for zero custom pipe code and Nest docs alignment |
| `@nestjs/throttler` | FR-015 rate limiting | Hand-rolled token bucket is ~the same size but untested |
| `helmet` | Constitution: baseline security headers | Setting 5 headers by hand is fine too; helmet is the audited default |
| *(none for static files)* | Express's built-in `useStaticAssets` serves the hashed bundles; `@nestjs/serve-static` was dropped as an unused dependency | A separate static host would complicate same-origin `/:code` routing, but the Nest wrapper adds nothing over the adapter method already available |
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
