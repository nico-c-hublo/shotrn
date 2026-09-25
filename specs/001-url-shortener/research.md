# Research: URL Shortener

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-09-22

All `NEEDS CLARIFICATION` items from the Technical Context are resolved below.

## 1. Short-code generation

> **Amended 2026-09-25** (constitution 1.1.0, then 1.2.0). The original decision, a
> Sqids encoding of the identity column, is kept under *Alternatives considered* with
> the reason it was reversed. Codes were first 11 characters backed by an
> unknown-code budget, then 13 characters without one (§2, §6).

**Decision**: Each code is 13 characters drawn independently from `[0-9A-Za-z]` with
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
- **Guessing is bounded by entropy, which is a length choice.** 62¹³ ≈ 2.0×10²³
  (~77.4 bits), well above the 64-bit floor OWASP sets for session identifiers, which
  are the closest analogue: a bearer secret in a URL. See §2 for the numbers.
- **Collisions are a non-issue, not merely rare.** The chance that a new code is
  already taken is N / 62¹³: about 5×10⁻¹⁷ with 10 million links. The same figure is
  an attacker's chance per guess, so a code space where retries are ever observed is
  one that is too small for FR-007. Three consecutive collisions mean the random
  source is broken, and the service fails the request instead of looping.
- **`ON CONFLICT DO NOTHING`** rather than catching a unique violation: no exception,
  no aborted transaction, no error-code parsing, and concurrent inserts of the same
  code are resolved by the unique index itself (SC-004).
- **Cost.** A text key inserted at random positions has worse insert locality than
  an ever-increasing `BIGINT`, and each row carries ~14 more bytes. At the 50
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

**Decision** (amended 2026-09-25, constitution 1.2.0): 13 characters, `[0-9A-Za-z]`,
fixed length, case-sensitive. The column uses `COLLATE "C"` and a
`CHECK (code ~ '^[0-9A-Za-z]{13}$')`.

**Rationale**:
- Expected links found by guessing = guesses × N / 62^L. A client may look codes up at
  the lookup limit (600 a minute on each of the redirect and preview routes, §6), so
  about 1.7 million guesses a day. With 1 million links:

  | Length | One client | 10,000 clients |
  |---|---|---|
  | 6 | 30/day | 304,000/day |
  | 8 | 0.008/day | 79/day |
  | 10 | 2×10⁻⁶/day | 0.02/day |
  | 11 | 3×10⁻⁸/day | 3×10⁻⁴/day |
  | 12 | 5×10⁻¹⁰/day | 5×10⁻⁶/day |
  | **13** | 9×10⁻¹²/day | 9×10⁻⁸/day |

  At 13 characters and 10 million links, 10,000 coordinated clients find about
  0.0003 links a year, one every ~3,200 years (SC-009).
- **Why 13 and not 11 with a guessing budget.** The first version used 11 characters
  plus a budget of 20 unknown-code lookups per client per 10 minutes (§6), which cut
  each client's guesses by ~600× and gave ~0.002 links a year in the scenario above.
  Two more characters multiply the code space by 3,844, so 13 characters alone are
  ~6× stronger, and they cost nobody anything: the budget could only work by refusing
  real links too, which let one user on a shared IPv4 address lock everyone else on it
  out. Both defences scale the same way with attacker size, so the ratio holds for
  larger botnets. 14 characters (one link every ~200,000 years) was considered;
  beyond 13, guessing stops being the realistic way to find a link, next to leaks
  through chat logs, browser history or `Referer` headers.
- **Length.** A full link on a short domain stays under 30 characters
  (`https://sho.rt/` + 13 = 28), as SC-008 intends.
- **Fixed length** keeps the format check a single regular expression and makes every
  reserved first path segment (`api`, `p`, `assets`) impossible to shadow, because
  none is 13 characters long. The Sqids blocklist is no longer needed.
- **`COLLATE "C"`** compares strings byte by byte. The database's default collation
  follows language rules (for example `en_US.UTF-8`), which are slower to compare and
  are not a stable ordering to build a key on: an operating-system locale update can
  change it and silently corrupt a text index. The codes are ASCII identifiers, not
  words, so byte order is the only meaning they have. Equality is case-sensitive under
  both collations, as FR-006 requires.
- No profanity filter: the spec does not require one. At 13 random characters, a
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
- `GET /:code` and `GET /api/links/:code`: 600 per minute per client, each (FR-020).
- Exceeding → `429` with `{ error: { code: 'RATE_LIMITED', message } }` and
  `Retry-After`.

**Client key** (amended 2026-09-25): an IPv4 address as is; an IPv4-mapped IPv6
address (`::ffff:a.b.c.d`) as its IPv4 form; any other IPv6 address as its /64 prefix.
A single subscriber is routinely delegated a whole /64 (2⁶⁴ addresses), so keying on
the full address would let one client rotate addresses and escape every limit. The
key applies to every limit, since the same rotation defeats the create limit.
`@nestjs/throttler` has keyed this way by default since 6.7 (`normalizeIp`), so the
dependency floor is raised to 6.7 and the prefix is set explicitly so a changed default
cannot loosen it. No address parsing is hand-rolled.

**Unknown-code budget: added, then removed** (2026-09-25). Constitution 1.1.0 added a
separate budget of 20 unknown-code lookups per client per 10 minutes, with 11-character
codes. Constitution 1.2.0 removed it in favour of 13-character codes (§2). The record:
- *It had to refuse real links too.* The server only knows a code is real after
  looking it up. Letting hits through once the budget was spent would answer 301 for
  real codes and 429 for the rest, which is exactly the oracle a guesser wants. So a
  spent budget refused every lookup, and anyone sharing a client's IPv4 address
  (carrier-grade or office NAT) could be locked out of every link by one user who
  opened 20 non-existent codes.
- *It was intricate.* A miss is known only after the lookup, so it was a guard with
  in-flight reservations, waiters and a sweep, not a throttler. The load check and a
  code review found four defects in it: concurrent hits refused, a reservation leaked
  by a client that disconnected while waiting, `/favicon.ico` charged as a guess, and
  every typo charged twice.
- *Length did better.* Two extra characters give ~6× more guessing resistance than the
  budget, with no lockout and no code.

The lookup limit that remains must still answer the same way whether or not a code
exists (FR-020): the throttler refuses before the lookup, so it does.

**Rationale**: Spec FR-015 + assumption (60/h). In-memory store is per-instance; with N
instances the effective limit is N× — acceptable for v1 abuse control and avoids a
shared store. Redirect limit is high enough that a shared link in a chat room does
not trip it, low enough to make enumeration slow.

Production limits are deliberately below the SC-003 load target (1,000 redirects/s):
the load check raises `RATE_LIMIT_REDIRECT_PER_MINUTE` via environment so it measures
the service rather than the limiter (tasks T076). Production abuse control is unchanged.
The §2 figures assume this limit: without it a client is bounded only by throughput
(~6,000 lookups/s measured), about 300× more guesses.

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
5. `hostname` (lower-cased) must not equal the service's own host from `PUBLIC_BASE_URL`.
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
| *(none for codes)* | `node:crypto` `randomInt` draws each character | `sqids` was removed with the move to random codes (§1); `nanoid` would add a dependency to replace a 13-iteration loop |
| Drizzle ORM + drizzle-kit | Typed schema, generated SQL migrations (constitution: versioned migrations) | Raw `pg` + hand-written migrations needs a bespoke migration runner and untyped rows; more code to own than Drizzle's ~zero-runtime layer. Prisma/TypeORM rejected as heavier (codegen/decorator magic) for one table. |
| `pg` | Postgres driver (Drizzle peer) | — |
| `class-validator` + `class-transformer` | Nest-idiomatic DTO validation with `whitelist` stripping | Zod pipe is comparable; class-validator chosen for zero custom pipe code and Nest docs alignment |
| `@nestjs/throttler` | FR-015 rate limiting | Hand-rolled token bucket is ~the same size but untested |
| `helmet` | Constitution: baseline security headers | Setting 5 headers by hand is fine too; helmet is the audited default |
| *(none for static files)* | Express's built-in `useStaticAssets` serves the hashed bundles; `@nestjs/serve-static` was dropped as an unused dependency | A separate static host would complicate same-origin `/:code` routing, but the Nest wrapper adds nothing over the adapter method already available |
| React 19 + Vite 8 (as Vite+ core) | User-mandated frontend | — |
| Vitest + Supertest (backend) | One test runner for both workspaces, and the one Vite+ runs; contract tests over HTTP | Jest was the original choice (the Nest default) because Vitest on Vite 6 needed SWC to emit decorator metadata. Vite 8 transforms with Oxc, which emits it, so that cost is gone (Phase 10) |
| Vitest + Testing Library | Vite-native frontend tests | — |
| `qrcode.react` | FR-021 QR code; zero runtime dependencies, renders React SVG elements | See §12: a hand-rolled encoder, `qrcode`, `uqr`, and a server-rendered image were each rejected |
| `@testcontainers/postgresql` | Constitution IV: one command, no manually provisioned state | `pg-mem` is not Postgres-faithful (identity, TIMESTAMPTZ); docker-compose-managed test DB is "manually provisioned state" |
| Vite+ (`vite-plus`) | One toolchain for build, dev server, tests, lint, format and type check: Vite 8 core, Vitest 5, oxlint with type-aware rules (tsgolint, TypeScript 7) and oxfmt, configured from one root `vite.config.ts`. Replaced ESLint, typescript-eslint, @eslint/js, Prettier, Jest and ts-jest (Phase 10). The lint rules are the effective ESLint rules, plus oxlint's correctness category, checked with planted violations | Keeping ESLint + Prettier + Jest worked, but meant three configurations and three upgrade cadences for one repository. **Risk, accepted**: this is `1.0.0-rc.0`. It aliases `vite` to its own core (`@voidzero-dev/vite-plus-core`) and pins exact versions of oxlint, oxfmt (0.x) and tsgolint (a TypeScript 7 preview), so upgrades arrive together on VoidZero's schedule. The lockfile, the CI gate and Dependabot catch a bad release; falling back means restoring the Phase 9 configuration from git |
| `eslint-plugin-react-hooks` (inside oxlint) | Rules of hooks and exhaustive effect dependencies: violations compile fine and fail only at run time. Loaded through oxlint's `jsPlugins`, because oxlint's built-in rules-of-hooks and exhaustive-deps missed planted violations | Review alone misses a missing effect dependency; the React team's own plugin is the reference implementation |

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

## 12. QR code for the short link

**Decision**: `ResultCard` renders `QRCodeSVG` from `qrcode.react` for `link.shortUrl`,
error correction level `M`, a four-module margin, and fixed `#000`/`#fff` colours. CSS
sizes the SVG: full card width capped at 14rem on a phone, a fixed column beside the
link from 36rem upwards.

**Rationale**:
- SVG with a `viewBox` scales to any CSS size and stays sharp at every device pixel
  ratio. A canvas would have to be resized for each ratio and blurs when CSS scales it.
- The colours ignore dark mode on purpose: many scanners cannot read a light-on-dark
  code, and the white margin is the quiet zone the standard requires.
- Level `M` recovers 15% damage (glare, moiré when photographing a screen). A short
  URL is ~30 characters, so `M` costs at most one version step over `L`.
- The client already holds the short link, so encoding it there adds no endpoint, no
  request, and no rate-limit surface. The CSP needs no change: the SVG is inline DOM,
  not a `data:` image.

**Alternatives considered**:
- Hand-rolled encoder: version selection, Reed–Solomon, and masking are several
  hundred lines to own and test for no gain.
- `qrcode`: pulls `yargs`, `pngjs`, and `dijkstrajs` in for its CLI and PNG output.
- `uqr`: pre-1.0, and returns an SVG string (needs `dangerouslySetInnerHTML`) or a raw
  matrix (needs our own renderer).
- A server endpoint returning an image: another route to validate and rate-limit, for
  data the browser already has.

## 13. Colour scheme toggle

**Decision**: Each colour token is one `light-dark()` pair on `:root`, and the scheme is
picked by the `color-scheme` property: `light dark` (the device decides) by default,
pinned by `data-theme="light"` or `"dark"` on `<html>`. The choice is kept in
`localStorage` under `theme`. `main.tsx` applies it before React renders; `ThemeToggle`
changes it and highlights the scheme in effect, following the device while nothing is
stored.

**Rationale**:
- `light-dark()` states each pair once. A media query plus a `[data-theme]` override
  would need every dark token written twice, and the copies would drift.
- `color-scheme` also switches native controls (the expiry `<select>`, scrollbars), so
  the toggle changes the whole page, not only our colours.
- The CSP allows no inline script (`script-src 'self'`), so the usual pre-paint snippet
  in `index.html` cannot run. Applying the choice in the entry module is the earliest
  point the CSP permits; a visitor whose pick differs from the device can see the
  device's scheme for one frame on a slow load.
- Storage can throw (blocked site data, some private modes). Every access is guarded,
  and a failure leaves the page following the device, which is where it started.
- The switch cross-fades through the View Transitions API: one snapshot of the whole
  page, native controls and the QR code included, and only when the visitor picks. A
  CSS `transition` on every element would also animate the first paint, slow every hover
  effect, and cannot reach native controls. Browsers without the API, and visitors who
  ask for reduced motion, get the instant switch.
- No dependency: two buttons and a few lines of storage handling.

**Alternatives considered**:
- A three-way light/dark/system control: the request was a two-icon toggle, and until
  the first pick the page already follows the device.
- Hashing an inline script into the CSP: every edit to the snippet changes the hash,
  and the backend would have to know the frontend's source.
