# Shotrn

Turn a long link into a short one that redirects to the original URL. Links can be
permanent or set to expire.

Built from the specification in [`specs/001-url-shortener/`](specs/001-url-shortener/)
under the principles in [`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## How short codes work

A short code is a **secret**: holding it is the only way to learn where the link goes.
Each code is 11 characters drawn independently from `[0-9A-Za-z]` with
`crypto.randomInt`, and it is stored as the table's primary key:

```
POST /api/links  →  draw 11 random chars  →  INSERT … ON CONFLICT (code) DO NOTHING  →  "k9Xz2QmB7rT"
GET  /k9Xz2QmB7rT  →  format check  →  SELECT by primary key  →  301/302
```

Nothing derives a code (no counter, key or alphabet), so no configuration value or leak
short of the database itself lets anyone compute one. The only attack left is guessing
among 62¹¹ ≈ 5.2×10¹⁹ codes (~65.5 bits).

A clash with an existing code is reported by the insert as an empty result, and the
service draws again. The odds are about 2×10⁻¹³ per draw at 10 million links, so three
clashes in a row fail the request: that would mean a broken random source, not bad luck.

Why this replaced Sqids, why a keyed permutation was rejected, and the arithmetic behind
11 characters are in [`research.md §1–2`](specs/001-url-shortener/research.md).

### Scaling

Codes need no coordination, so any number of backend instances can create links
without a shared counter. The path, none of which changes the code format or the API:

1. **now** — one Postgres primary, no cache
2. **reads grow** — in-process LRU for unexpired permanent links, then read replicas
3. **storage grows** — shard by hash of the code

## Prerequisites

Node.js 22+ and Docker (Docker is needed for the test suite, which provisions its own
PostgreSQL via Testcontainers).

The app reads a `.env` at the repository root via Node's built-in `process.loadEnvFile`,
so no dotenv dependency is involved. **Real environment variables always win** — `.env`
is a local convenience, and production and CI simply have no file.

## Setup

```bash
cp .env.example .env
npm install
docker compose up -d postgres
npm run db:migrate            # picks DATABASE_URL up from .env
```

Every command below reads `.env` the same way. To override a value for one run, export
it: an exported variable takes precedence over the file.

### Environment

| Variable                         | Example                                    | Notes                                            |
| -------------------------------- | ------------------------------------------ | ------------------------------------------------ |
| `DATABASE_URL`                   | `postgres://app:app@localhost:5432/shotrn` | App role needs only `SELECT`/`INSERT`            |
| `BASE_URL`                       | `http://localhost:3000`                    | Used for `shortUrl` and the self-reference check |
| `PORT`                           | `3000`                                     |                                                  |
| `RATE_LIMIT_CREATE_PER_HOUR`     | `60`                                       | Per client IP                                    |
| `RATE_LIMIT_REDIRECT_PER_MINUTE` | `600`                                      | Per client IP                                    |

## Run

```bash
npm run dev               # backend :3000 + Vite dev server :5173
npm run build && npm start  # production: backend serves the built SPA
```

In development, open <http://localhost:5173>. Vite proxies `/api` and short-code paths to
the backend, so short links work from either port. Short URLs are built from `BASE_URL`,
so they point at `:3000`. After `npm start`, everything is on <http://localhost:3000>.

## Quality gate

All three must pass before pushing; CI runs the same.

```bash
npm run check                  # typecheck + eslint + prettier
npm test                       # unit + contract + integration + frontend
npm audit --audit-level=high
```

## Layout

```
backend/    NestJS service: API, redirect, SPA shell, Postgres access
frontend/   React + TypeScript SPA (no router: two screens picked from the path)
specs/      Specification, plan, research, data model, contract, tasks
```

## Routes

| Route                  | Purpose                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `POST /api/links`      | Shorten a URL. Never deduplicates: the same URL twice yields two codes                      |
| `GET /api/links/:code` | Preview metadata. 200 active, 410 expired (expiry only, never the destination), 404 unknown |
| `GET /:code`           | Redirect. 301 permanent (cacheable), 302 temporary (`no-store`), 410 expired, 404 unknown   |
| `GET /` and `/p/:code` | SPA pages                                                                                   |
| `GET /assets/*`        | Hashed frontend bundles                                                                     |

Full contract: [`contracts/openapi.yaml`](specs/001-url-shortener/contracts/openapi.yaml).

## Technical choices

Each choice is justified, with alternatives considered, in
[`research.md`](specs/001-url-shortener/research.md).

- **NestJS + React 19/Vite.** NestJS provides DI, the validation pipe, the throttler and
  exception filters out of the box; the backend also serves the built SPA, so short
  codes and the UI share one origin (§8).
- **PostgreSQL 16 + Drizzle ORM.** `INSERT … ON CONFLICT DO NOTHING RETURNING` stores a
  link or reports a clash in one round-trip,
  `TIMESTAMPTZ` keeps expiry timezone-correct, and Drizzle provides typed rows and
  versioned SQL migrations without Prisma/TypeORM weight (§3, §8).
- **Random stored codes.** Codes are secrets rather than an encoded counter, so a
  leaked configuration reveals none of them; see
  [How short codes work](#how-short-codes-work) (§1, §2).
- **301 for permanent, 302 for expiring links.** Permanent links can be cached by
  browsers because they never change; expiring ones are `no-store` so expiry takes effect
  for returning visitors (§4).
- **Preview at `/p/:code`** instead of a bit.ly-style `code+` suffix, which Express
  routes inconsistently (§5).
- **No frontend router.** Two screens are picked from `window.location.pathname` (§9).
- **Validation at the boundary.** `class-validator` DTOs with the platform `URL` parser;
  only `http`/`https` are accepted (§7).
- **Tests on a real Postgres.** Testcontainers provisions it, so `npm test` needs only
  Docker; `pg-mem` was rejected as not Postgres-faithful (§8).

## Assumptions & shortcuts

- **Rate limits are per instance.** `@nestjs/throttler` uses its in-memory store, so
  with N backend instances the effective limit is N× the configured one. Acceptable for
  v1 abuse control; a Redis store is the upgrade path (§6).
- **One reverse proxy in front.** `trust proxy` is set to `1`, so client IPs (and
  therefore rate-limit keys) are only correct behind exactly one proxy. Adjust it in
  `backend/src/main.ts` for other topologies.
- **Server clock decides expiry.** Expiry is a fixed set (`1h`, `1d`, `7d`, `30d`,
  `never`) computed server-side and stored as an absolute timestamp (§10).
- **Expired links are kept.** There is no purge job, so an expired code keeps answering
  `410` instead of `404`; a one-line cron can be added when volume warrants (§11).
- **No deduplication.** Shortening the same URL twice yields two codes.
- **Load numbers are headroom, not an SLA.** The [load check](specs/001-url-shortener/load-results.md)
  ran on one machine with the rate limits raised so it measured the service, not the
  limiter.

### Not in v1

No accounts, custom aliases, analytics, link editing or deletion, or multi-domain
support ([spec assumptions](specs/001-url-shortener/spec.md#assumptions)).
Private/loopback destination filtering is deliberately deferred — doing it correctly
requires DNS resolution on the write path and re-checking on read, and a literal-IP check
alone gives false confidence ([`research.md §7`](specs/001-url-shortener/research.md)).
