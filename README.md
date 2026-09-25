# Shotrn

Turn a long link into a short one that redirects to the original URL. Links can be
permanent or set to expire.

Built from the specification in [`specs/001-url-shortener/`](specs/001-url-shortener/)
under the principles in [`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## How short codes work

The short code is **not stored**. Each row's `BIGINT` identity column is the only id
source; the code is `sqids.encode(id)`, and a redirect decodes the code back to the
primary key:

```
POST /api/links  →  INSERT ... RETURNING id  →  sqids.encode(id)  →  "k9Xz2Q"
GET  /k9Xz2Q     →  sqids.decode → id        →  SELECT by PK      →  301/302
```

Uniqueness is the database's guarantee, so there is no collision handling anywhere in
the code. A shuffled, deployment-specific alphabet keeps adjacent ids from producing
adjacent-looking codes.

**Sqids is obfuscation, not encryption.** Anyone who learns the alphabet can enumerate;
that is mitigated by rate limiting the redirect path, and no secret data sits behind a
code (the destination is public by design).

### Scaling

Today one Postgres primary handles the counter: sequences are lock-free and
non-transactional, so any number of backend instances share it with no coordination.
The documented path, none of which changes the code format or the API, is in
[`research.md §1`](specs/001-url-shortener/research.md):

1. **now** — identity column, no cache
2. **reads grow** — in-process LRU for unexpired permanent links, then read replicas
3. **writes grow** — swap `LinksRepository.insert` for per-instance range allocation
4. **storage grows** — shard by id range; the decoded id identifies the shard

## Prerequisites

Node.js 22+ and Docker (Docker is needed for the test suite, which provisions its own
PostgreSQL via Testcontainers).

The app reads a `.env` at the repository root via Node's built-in `process.loadEnvFile`,
so no dotenv dependency is involved. **Real environment variables always win** — `.env`
is a local convenience, and production and CI simply have no file.

## Setup

```bash
cp .env.example .env          # then fill in SQIDS_ALPHABET (see below)
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
| `SQIDS_ALPHABET`                 | 62-char shuffle of `[0-9A-Za-z]`           | See the warning below                            |
| `RATE_LIMIT_CREATE_PER_HOUR`     | `60`                                       | Per client IP                                    |
| `RATE_LIMIT_REDIRECT_PER_MINUTE` | `600`                                      | Per client IP                                    |

Generate the alphabet once:

```bash
node -e "const a=[...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}console.log(a.join(''))"
```

> **`SQIDS_ALPHABET` must never change after launch.** The code _is_ the encoded id, so a
> different alphabet decodes every existing short link to the wrong row or to nothing.
> Treat it like a secret that can never be rotated: set it once, keep it out of logs, and
> back it up with the database.

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

| Route                  | Purpose                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `POST /api/links`      | Shorten a URL. Never deduplicates: the same URL twice yields two codes                    |
| `GET /api/links/:code` | Preview metadata. 200 active, 410 expired (body retained), 404 unknown                    |
| `GET /:code`           | Redirect. 301 permanent (cacheable), 302 temporary (`no-store`), 410 expired, 404 unknown |
| `GET /` and `/p/:code` | SPA pages                                                                                 |
| `GET /assets/*`        | Hashed frontend bundles                                                                   |

Full contract: [`contracts/openapi.yaml`](specs/001-url-shortener/contracts/openapi.yaml).

## Technical choices

Each choice is justified, with alternatives considered, in
[`research.md`](specs/001-url-shortener/research.md).

- **NestJS + React 19/Vite.** NestJS provides DI, the validation pipe, the throttler and
  exception filters out of the box; the backend also serves the built SPA, so short
  codes and the UI share one origin (§8).
- **PostgreSQL 16 + Drizzle ORM.** `INSERT … RETURNING` gives the id in one round-trip,
  `TIMESTAMPTZ` keeps expiry timezone-correct, and Drizzle provides typed rows and
  versioned SQL migrations without Prisma/TypeORM weight (§3, §8).
- **Sqids over the row id.** Short, non-sequential codes with no stored code column and
  no collision handling; see [How short codes work](#how-short-codes-work) (§1, §2).
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
