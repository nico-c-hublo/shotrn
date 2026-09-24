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

## Things that will bite you

- **`SQIDS_ALPHABET` is effectively immutable.** The short code is the Sqids encoding of
  the row id, so changing the alphabet silently breaks every link ever issued. It is not
  a tuning knob.
- **Codes are derived, never stored.** There is no `code` column. If you find yourself
  adding one, re-read `research.md §1` first.
- **Decoding requires the canonical check.** `sqids.decode` returns a number for many
  strings we never issued; `short-code.ts` re-encodes and compares. Removing that check
  makes `/aaaaaa` resolve to a real link.
- **Route order matters.** `RedirectController`'s `/:code` is a catch-all and must stay
  last in `LinksModule.controllers`, after `/api/links` and `/p/:code`.
- **`expires_at > created_at` is enforced by the database.** Backdating an expiry in a
  test also requires backdating `created_at`.
- **The `pg` pool needs its `error` listener.** Without it, an idle client dying during a
  database restart takes the whole process down.
- **Validate against the documented commands, not a hand-rolled script.** Exporting
  variables in a test harness hides whether `npm run db:migrate` and `npm start` actually
  work; that is how `.env` support went missing in the first place.
- **410 is not an error.** An expired link returns a `LinkResponse` with
  `status: 'expired'`, not an error envelope. There is deliberately no `GONE` error code.

## Security invariants

These are constitutional (Principle III) and every one has a negative test. Do not
weaken one without amending the constitution first.

- Only `http`/`https` URLs are accepted; the platform `URL` parser does the parsing.
- Validation happens at the boundary (`ValidationPipe` + `IsHttpUrl`); internal modules
  assume validated input and must not re-validate.
- Error responses carry a stable code and a safe message — never a stack trace, SQL, or
  filesystem path.
- Secrets come from the environment and never reach a log, a response, or the repo.
- Both public paths are rate limited, on separate throttlers so creation limits cannot
  block redirects.

## Style

Follow the surrounding code. Comments explain _why_, not _what_. `any` and disabled type
checks need an inline justification. Dead code is deleted, not commented out.
