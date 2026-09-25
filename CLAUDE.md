# Working in this repository

Operational guidance for agents and developers. It must not contradict
`.specify/memory/constitution.md`; if it does, the constitution wins.

## Before you change anything

- Read the relevant part of `specs/001-url-shortener/`. Work is specified before it is
  built: spec → plan → tasks → implement.
- One change addresses one task. Unrelated refactors and formatting sweeps go in their
  own change.

## Commands

```bash
npm run check   # typecheck + eslint + prettier — must pass before pushing
npm test        # unit + contract + integration + frontend; needs Docker, nothing else
npm run dev     # backend :3000 + Vite :5173
```

Tests provision their own PostgreSQL through Testcontainers. Never point the suite at a
hand-created database: "no manually provisioned state" is a constitutional requirement.

## Configuration

`backend/src/config/load-env-file.ts` loads the repo-root `.env` through Node's
`process.loadEnvFile`, called first in both entry points (`main.ts` bootstrap and
`db/migrate.ts`). Already-set variables are never overwritten, which is what keeps the
Testcontainers suite and CI safe from a developer's `.env`.

If you add an entry point that reads configuration, call `loadEnvFile()` before
`loadEnv()`, and add it to the documented-flow test in
`backend/test/contract/env-file.e2e-spec.ts`.

## Bisecting

Every commit that has a `package.json` passes `npm run check` and `npm test`. The five
documentation commits at the start of history predate the project and cannot be built,
so a bisect script should report them as untestable rather than bad:

```bash
git bisect run sh -c '[ -f package.json ] || exit 125; npm ci --silent && npm run check && npm test'
```

Exit 125 is git's "skip this commit". Keep it: without it a bisect lands on a
documentation commit and reports it as the culprit.

The early code commits ran both test runners with `--passWithNoTests`, which kept them
runnable before any test existed; those commits keep the flag in their own
`package.json`. From Phase 9 on it is gone, so a run that collects no tests fails.
Jest only fails when no project collects anything, though: a broken `testMatch` in one
project can still go unnoticed while the other finds tests. If you change a glob,
confirm the suite still collects the expected number of tests.

When adding a file, put it in the same commit as the code it references. Two ordering
defects were fixed by that rule: the end-to-end harness imported `src/main` before it
existed, and the Jest config named setup files that had not landed yet.

## Things that will bite you

- **Codes are secrets, never derived.** `generateCode` in `short-code.ts` is the only
  source. Do not make a code a function of anything (a counter, a key, a hash of the
  URL): if a value can compute codes, leaking it lists every link. `research.md §1`
  records why Sqids and a keyed permutation were both rejected.
- **A clash is an empty insert, not an exception.** `LinksRepository.insert` uses
  `ON CONFLICT DO NOTHING` and returns `null`; the service draws again. A `SELECT`
  before the insert would race, and catching the unique violation aborts the transaction.
- **The code length lives in five places.** `CODE_LENGTH` in `short-code.ts`, the
  `code_format` CHECK in `schema.ts` and in the migration, and the route patterns in
  `frontend/src/App.tsx` and `frontend/vite.config.ts`. Changing it needs a migration.
- **`COLLATE "C"` exists only in the migration.** Drizzle has no collation option, so
  `schema.ts` cannot show it. Do not drop it: codes are case-sensitive byte strings, and
  a locale collation can reorder the key after an OS update.
- **Route order matters.** `RedirectController`'s `/:code` is a catch-all and must stay
  last in `LinksModule.controllers`, after `/api/links` and `/p/:code`.
- **`expires_at > created_at` is enforced by the database.** Backdating an expiry in a
  test also requires backdating `created_at`.
- **The `pg` pool needs its `error` listener.** Without it, an idle client dying during a
  database restart takes the whole process down.
- **Validate against the documented commands, not a hand-rolled script.** Exporting
  variables in a test harness hides whether `npm run db:migrate` and `npm start` actually
  work; that is how `.env` support went missing in the first place.
- **410 is not an error.** An expired link returns an `ExpiredLinkResponse` (`code`,
  `status: 'expired'`, `expiresAt`), not an error envelope. There is deliberately no
  `GONE` error code. Never add the destination back: see the security invariants.

## Security invariants

These are constitutional (Principle III) and every one has a negative test. Do not
weaken one without amending the constitution first.

- Only `http`/`https` URLs are accepted; the platform `URL` parser does the parsing.
- Validation happens at the boundary (`ValidationPipe` + `IsHttpUrl`); internal modules
  assume validated input and must not re-validate.
- Error responses carry a stable code and a safe message — never a stack trace, SQL, or
  filesystem path.
- Secrets come from the environment and never reach a log, a response, or the repo.
  Short codes count as secrets: logs carry the route pattern (`GET /:code`), never the
  path, and a failed query is logged by its SQL and database error, never its
  parameters (Drizzle puts them in the error message; see `describeFailure`).
- Short codes are 13 characters from a CSPRNG and derived from nothing, so no leaked
  value can compute them.
- An expired link reveals when it expired, never where it pointed. The expired
  `Resolution` carries no row, so a controller has nothing to leak.
- Both public paths are rate limited, on separate throttlers so creation limits cannot
  block redirects. Clients are keyed per IPv4 address or IPv6 /64
  (`ipv6SubnetPrefix: 64`), so rotating addresses in one allocation resets nothing.
- Every route that looks a code up is rate limited on the `redirect` throttler. A new
  lookup route without it would be an unlimited guessing oracle. Guessing resistance
  comes from code length, not from locking out clients who guess (research.md §2).

## Style

Follow the surrounding code. Comments explain _why_, not _what_. `any` and disabled type
checks need an inline justification. Dead code is deleted, not commented out.
