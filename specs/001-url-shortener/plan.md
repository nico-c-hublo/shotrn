# Implementation Plan: URL Shortener

**Branch**: `001-url-shortener` | **Date**: 2026-09-22 | **Spec**: [spec.md](spec.md)

**Amended**: 2026-09-25 — random stored 13-character codes replace Sqids; clients keyed
per IPv6 /64; expired links withhold their destination (constitution 1.1.0, 1.2.0). An
unknown-code budget was added and then removed in favour of code length. Research §1,
§2, §5 and §6 carry the reasoning.

**Input**: Feature specification from `/specs/001-url-shortener/spec.md`

## Summary

Anonymous visitors submit an `http`/`https` URL and receive a short, unguessable code
that redirects to it; links may carry an expiry after which they show an "expired" page.
The backend is a single NestJS service on PostgreSQL. Short codes are **random and
stored**: 13 characters drawn with `crypto.randomInt`, used as the `links` primary key.
A clash is reported by `ON CONFLICT DO NOTHING` and answered with a fresh draw. No
counter, key or alphabet exists whose disclosure would reveal codes, so the only way to
find a link is to guess, and guessing is bounded by code length (~77 bits) and the
per-client lookup limit. The frontend is a small React + TypeScript SPA (Vite)
served by the same service in production.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node.js 22 LTS

**Primary Dependencies**:
- Backend: NestJS 11 (Express adapter), Drizzle ORM + `drizzle-kit` (schema +
  migrations), `pg`, `@nestjs/throttler`, `helmet`, `class-validator`/`class-transformer`
- Frontend: React 19, Vite 8, React Testing Library
- Dev/test: Vitest 5 + Supertest (backend), Vitest 5 (frontend), `@testcontainers/postgresql`

**Storage**: PostgreSQL 16 — one table (`links`), keyed by the random short code

**Testing**: Backend: Vitest `unit` project (`src/**/*.spec.ts`) + `e2e` project for
contract/integration (`test/**/*.e2e-spec.ts`) against a Testcontainers Postgres. Frontend: Vitest + Testing
Library. Single root command `npm test` runs everything.

**Target Platform**: Linux container (Node 22), behind an HTTPS-terminating proxy

**Project Type**: Web application (backend service + SPA frontend), npm workspaces
monorepo

**Performance Goals**: 1,000 redirects/s and 50 creates/s sustained (SC-003); redirect
p99 < 300 ms end-to-end (SC-002). Redirect path = format check (pure CPU) + one PK
lookup. Creation latency is not constrained beyond that (up to 1 s is acceptable).

**Constraints**:
- Short code exactly 13 chars, alphanumeric, case-sensitive (FR-006)
- Codes unguessable (FR-007): CSPRNG, ~77.4 bits, not derived from anything
- Lookups limited per client, keyed per IPv4 address or IPv6 /64 (FR-020)
- URL ≤ 2,048 chars, `http`/`https` only, no self-reference (FR-002..004)
- Links survive restarts (FR-014) → Postgres is the only source of truth, no
  in-memory state on the write path
- No deduplication (FR-018)

**Scale/Scope**: 4 user stories, 4 HTTP routes, 1 table, ~3 screens (form/result,
preview, not-found/expired). Code space: 62¹³ ≈ 2.0×10²³; the chance a new code
collides is N / 62¹³ (5×10⁻¹⁷ at 10 million links).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| I. Simplicity First | Every dependency justified with rejected simpler alternative | PASS — see [research.md](research.md) §Dependencies; no plugin/adapter layers; one table; `sqids` removed, codes drawn with `node:crypto` |
| I. Simplicity First | No speculative generality | PASS — the code generator is injected only so tests can force a collision |
| II. Readable, Typed Code | `strict: true`, lint + format enforced by tooling | PASS — Vite+ (`vp check`: oxfmt, oxlint with type-aware rules, TypeScript 7 type check) from one root `vite.config.ts`, plus `tsc`; `npm run check` gates type/lint/format |
| III. Security by Default | Input validated at boundary with explicit schema | PASS — `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` + custom `IsHttpUrl` validator using platform `URL` parser |
| III. Security by Default | Scheme allow-list `http`/`https` | PASS — enforced in `url-validation.ts`, negative tests required |
| III. Security by Default | Secrets via env, never logged | PASS — `DATABASE_URL` from env, validated at boot, redacted in logs; codes need no secret at all |
| III. Security by Default | Codes are bearer secrets, ≥ 77 bits (1.2.0) | PASS — 13 characters from `crypto.randomInt`, ~77.4 bits, not derived from any counter or key (research §1–2) |
| III. Security by Default | Every lookup route rate limited per client and /64 (1.2.0) | PASS — redirect-tier throttler on `/:code` and `/api/links/:code`, 600/min each; all limits keyed per IPv4 address or IPv6 /64 (research §6) |
| III. Security by Default | Expired links withhold their destination (1.1.0) | PASS — 410 body is `ExpiredLinkResponse` (`code`, `status`, `expiresAt`) (research §5) |
| III. Security by Default | Rate limit on public writes; security headers | PASS — `@nestjs/throttler` on create (60/h/client) and redirect (600/min/client); `helmet` |
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
│   │   ├── redirect.controller.ts  # GET /:code (catch-all, registered last)
│   │   ├── pages.controller.ts     # GET /, GET /p/:code -> SPA index.html
│   │   ├── spa.ts                  # reads the built index.html, sends it with a status
│   │   ├── links.service.ts        # create (draw + retry on clash) / resolve; expiry logic
│   │   ├── links.service.spec.ts   # unit: collision retry, malformed codes skip the database
│   │   ├── links.repository.ts     # insert (ON CONFLICT DO NOTHING) / findByCode (Drizzle)
│   │   ├── short-code.ts           # generateCode() with crypto.randomInt, isWellFormedCode()
│   │   ├── short-code.spec.ts      # unit: format, alphabet coverage, reserved segments
│   │   ├── code-generator.provider.ts  # DI token so tests can force a collision
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
│   │   ├── preview.e2e-spec.ts
│   │   └── rate-limit.e2e-spec.ts   # FR-015/FR-020: isolation, /64 keying
│   ├── integration/
│   │   └── links.repository.e2e-spec.ts
│   └── setup/               # testcontainer lifecycle, migration runner
├── drizzle.config.ts
├── vite.config.mts          # Vitest unit + e2e projects, one Vite for both workspaces
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
backend serves `frontend/dist`: Express's `useStaticAssets` serves the hashed bundles
under `/assets/**`, and `PagesController` sends `index.html` for `/` and `/p/:code`.
Static middleware cannot serve an index file for a parameterised path, so a controller
owns those two routes; `@nestjs/serve-static` would add a dependency without changing
that. Every other single-segment path is a redirect candidate;
no reserved segment (`api`, `p`, `assets`) is 13 characters long, so no code can
shadow one (research §2). No client-side router: two screens are selected from
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
