# Implementation Plan: URL Shortener

**Branch**: `001-url-shortener` | **Date**: 2026-09-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-url-shortener/spec.md`

## Summary

Anonymous visitors submit an `http`/`https` URL and receive a short, non-guessable code
that redirects to it; links may carry an expiry after which they show an "expired" page.
The backend is a single NestJS service on PostgreSQL. Short codes are **derived, not
stored**: the `links` table's `BIGINT` identity column is encoded with Sqids
(shuffled alphabet, `minLength: 6`) to produce the code; redirects decode the code back
to the primary key. This gives uniqueness by construction, one write per create, no
coordination between backend instances, and a single-function seam (`IdGenerator`) for
moving to per-instance range allocation if write volume ever exceeds one Postgres
primary. The frontend is a small React + TypeScript SPA (Vite) served by the same
service in production.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node.js 22 LTS

**Primary Dependencies**:
- Backend: NestJS 11 (Express adapter), `sqids`, Drizzle ORM + `drizzle-kit` (schema +
  migrations), `pg`, `@nestjs/throttler`, `helmet`, `class-validator`/`class-transformer`
- Frontend: React 19, Vite 6, React Testing Library
- Dev/test: Jest + Supertest (backend), Vitest (frontend), `@testcontainers/postgresql`

**Storage**: PostgreSQL 16 — one table (`links`), identity column as the ID source

**Testing**: Backend: Jest unit (`src/**/*.spec.ts`) + contract/integration
(`test/**/*.e2e-spec.ts`) against a Testcontainers Postgres. Frontend: Vitest + Testing
Library. Single root command `npm test` runs everything.

**Target Platform**: Linux container (Node 22), behind an HTTPS-terminating proxy

**Project Type**: Web application (backend service + SPA frontend), npm workspaces
monorepo

**Performance Goals**: 1,000 redirects/s and 50 creates/s sustained (SC-003); redirect
p99 < 300 ms end-to-end (SC-002). Redirect path = decode (pure CPU) + one PK lookup.

**Constraints**:
- Short code ≤ 10 chars, alphanumeric, case-sensitive (FR-006); target 6 chars
- Codes non-sequential to a casual observer (FR-007) — Sqids with a
  deployment-specific shuffled alphabet
- URL ≤ 2,048 chars, `http`/`https` only, no self-reference (FR-002..004)
- Links survive restarts (FR-014) → Postgres is the only source of truth, no
  in-memory state on the write path
- No deduplication (FR-018)

**Scale/Scope**: 4 user stories, 4 HTTP routes, 1 table, ~3 screens (form/result,
preview, not-found/expired). ID space: 62⁶ ≈ 5.7×10¹⁰ six-char codes; Sqids grows to
7+ chars automatically beyond that, staying under the 10-char cap until
~8.4×10¹⁷ links.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| I. Simplicity First | Every dependency justified with rejected simpler alternative | PASS — see [research.md](research.md) §Dependencies; no plugin/adapter layers; one table; codes derived instead of stored |
| I. Simplicity First | No speculative generality | PASS — `IdGenerator` is a single function with one implementation; range allocation is *documented*, not built |
| II. Readable, Typed Code | `strict: true`, lint + format enforced by tooling | PASS — root ESLint (typescript-eslint) + Prettier, `npm run check` gates type/lint/format |
| III. Security by Default | Input validated at boundary with explicit schema | PASS — `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` + custom `IsHttpUrl` validator using platform `URL` parser |
| III. Security by Default | Scheme allow-list `http`/`https` | PASS — enforced in `url-validation.ts`, negative tests required |
| III. Security by Default | Secrets via env, never logged | PASS — `DATABASE_URL`, `SQIDS_ALPHABET` from env, validated at boot, redacted in logs |
| III. Security by Default | IDs non-enumerable to casual observer | PASS — Sqids shuffled alphabet; documented as obfuscation not secrecy, mitigated by redirect rate limit |
| III. Security by Default | Rate limit on public writes; security headers | PASS — `@nestjs/throttler` on create (60/h/IP) and redirect (600/min/IP); `helmet` |
| III. Security by Default | Lockfile + audit | PASS — `package-lock.json` committed; `npm audit --audit-level=high` in CI gate |
| IV. Tests Prove Behaviour | Contract/unit/integration split; negative security tests | PASS — see [quickstart.md](quickstart.md) test matrix |
| IV. Tests Prove Behaviour | One command, no manual state | PASS — Testcontainers provisions Postgres; requires Docker (documented) |
| V. Small, Reviewable Changes | One task per change | Enforced at `/speckit-tasks` granularity |
| Security Requirements: URL parsing with platform parser | PASS — `new URL()`; no regex-only validation |
| Security Requirements: private-range rejection (MAY) | DECIDED: not in v1 — no DNS resolution on the write path; recorded in research.md |
| Security Requirements: least-privilege DB user, versioned migrations | PASS — app role has DML only; `drizzle-kit` migrations applied by a separate step |
| Security Requirements: error disclosure | PASS — global exception filter maps to `{ error: { code, message } }` |

**Gate result (pre-research)**: PASS, no violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/001-url-shortener/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── openapi.yaml     # Phase 1 output — HTTP contract
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
package.json                 # npm workspaces: backend, frontend; root scripts: check, test
docker-compose.yml           # local Postgres 16 for dev (tests use Testcontainers)
.env.example                 # documented env vars, no secrets

backend/
├── src/
│   ├── main.ts              # bootstrap: helmet, ValidationPipe, exception filter
│   ├── app.module.ts
│   ├── config/
│   │   ├── env.ts           # typed env schema, fails fast on missing/invalid values
│   │   └── env.spec.ts      # unit: boot fails on missing/invalid vars, no secret leakage
│   ├── db/
│   │   ├── schema.ts        # Drizzle table definition (links)
│   │   ├── client.ts        # pg Pool + drizzle instance (Nest provider)
│   │   └── migrations/      # drizzle-kit generated SQL, committed
│   ├── links/
│   │   ├── links.module.ts
│   │   ├── links.controller.ts     # POST /api/links, GET /api/links/:code
│   │   ├── redirect.controller.ts  # GET /:code
│   │   ├── links.service.ts        # create / resolve; expiry logic
│   │   ├── links.repository.ts     # insert / findById (Drizzle)
│   │   ├── short-code.ts           # Sqids wrapper: encode(id), decode(code) w/ canonical check
│   │   ├── short-code.spec.ts      # unit: format, non-sequentiality, canonical round-trip
│   │   ├── url-validation.ts       # IsHttpUrl validator (platform URL parser)
│   │   ├── expiry.ts               # ExpiryOption → Date | null
│   │   ├── expiry.spec.ts          # unit: option → offset mapping
│   │   └── dto/
│   │       ├── create-link.dto.ts
│   │       └── link.response.ts
│   └── common/
│       ├── http-exception.filter.ts  # stable { error: { code, message } } shape
│       └── errors.ts                 # domain error classes + codes
├── test/
│   ├── contract/            # supertest against full Nest app + Testcontainers PG
│   │   ├── create-link.e2e-spec.ts
│   │   ├── redirect.e2e-spec.ts
│   │   └── preview.e2e-spec.ts
│   ├── integration/
│   │   └── links.repository.e2e-spec.ts
│   └── setup/               # testcontainer lifecycle, migration runner
├── drizzle.config.ts
├── jest.config.ts
├── tsconfig.json            # strict: true
└── package.json

frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx              # picks screen from location.pathname (/ or /p/:code)
│   ├── api/
│   │   └── links.ts         # typed fetch wrappers matching contracts/openapi.yaml
│   ├── components/
│   │   ├── ShortenForm.tsx  # url input + expiry select + client-side validation
│   │   ├── ResultCard.tsx   # short link, copy button, expiry display
│   │   └── PreviewCard.tsx  # original URL, created/expires, "go" link
│   └── styles.css
├── tests/
│   ├── ShortenForm.test.tsx
│   ├── ResultCard.test.tsx
│   └── PreviewCard.test.tsx
├── index.html
├── vite.config.ts           # dev proxy /api and /:code → backend
├── tsconfig.json            # strict: true
└── package.json
```

**Structure Decision**: Web application layout — `backend/` (NestJS) and `frontend/`
(Vite React) as two npm workspaces under one root so `npm run check` and `npm test`
gate both in a single command (constitution §Development Workflow). In production the
backend serves `frontend/dist`: hashed bundles under `/assets/**` and `index.html` at
`/` and `/p/:code`. Every other single-segment path is a redirect candidate;
`assets` is in the Sqids blocklist (research §2) so no code can shadow it. No client-side router: two screens are selected from
`location.pathname` (simplicity — a router dependency for two routes is unjustified).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Dependency-level justifications (why an ORM, why Testcontainers, why a
validation library) live in [research.md](research.md) §Dependencies as the
constitution's "concrete simpler alternative rejected" record.

## Post-Design Constitution Re-check

Re-evaluated after Phase 1 (data-model, contracts, quickstart):

- Data model is one table, no soft-delete/status columns, expiry as a nullable
  timestamp — simplest shape satisfying FR-011..014. PASS.
- Contract exposes 4 routes; error envelope is uniform; no internal detail in
  responses. PASS.
- Every FR maps to at least one named test in quickstart.md's matrix, including
  negative cases for FR-002/003/004/013/015. PASS.
- No new dependency introduced during design. PASS.

**Gate result (post-design)**: PASS.
