---
description: "Task list for URL Shortener implementation"
---

# Tasks: URL Shortener

**Input**: Design documents from `/specs/001-url-shortener/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/openapi.yaml](contracts/openapi.yaml),
[quickstart.md](quickstart.md)

**Tests**: INCLUDED. The project constitution makes tests non-negotiable
(Principle IV: "A change is not done until its behaviour is demonstrated by an
automated test", with explicit negative tests required for every security rule in
Principle III). Task titles match the FR → test matrix in
[quickstart.md](quickstart.md#automated-test-matrix).

**Organization**: Tasks are grouped by user story so each story is independently
implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths are included in every task

## Path Conventions

Web app, npm workspaces monorepo (per [plan.md](plan.md#project-structure)):
`backend/src/`, `backend/test/`, `frontend/src/`, `frontend/tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Repository, workspaces, tooling, and quality gate

- [X] T001 Create npm workspaces root at `package.json` with workspaces `["backend", "frontend"]` and scripts `check` (tsc --noEmit + eslint + prettier --check across both), `test`, `dev`, `build`, `start`
- [X] T002 [P] Create `backend/package.json` with NestJS 11 (Express adapter), `sqids`, `drizzle-orm`, `drizzle-kit`, `pg`, `@nestjs/throttler`, `helmet`, `class-validator`, `class-transformer`; dev deps Jest, Supertest, `@testcontainers/postgresql`, ts-jest; scripts include `db:migrate` (drizzle-kit migrate) as used by [quickstart.md](quickstart.md#setup)
- [X] T003 [P] Create `frontend/package.json` with React 19, Vite 6, `@vitejs/plugin-react`; dev deps Vitest, `@testing-library/react`, `@testing-library/user-event`, jsdom
- [X] T004 [P] Configure TypeScript with `strict: true` in `backend/tsconfig.json` and `frontend/tsconfig.json` (constitution II: no implicit any, no unchecked casts)
- [X] T005 [P] Configure ESLint (typescript-eslint) and Prettier at repo root in `eslint.config.js` and `.prettierrc`, covering both workspaces
- [X] T006 [P] Create `docker-compose.yml` with a PostgreSQL 16 service for local development (tests use Testcontainers, not this service)
- [X] T007 [P] Create `.env.example` documenting `DATABASE_URL`, `BASE_URL`, `SQIDS_ALPHABET`, `PORT`, `RATE_LIMIT_CREATE_PER_HOUR=60`, `RATE_LIMIT_REDIRECT_PER_MINUTE=600` per [quickstart.md](quickstart.md#setup); no real secrets
- [X] T008 [P] Create `.gitignore` excluding `node_modules/`, `dist/`, `.env`, coverage output
- [X] T009 [P] Configure `backend/jest.config.ts` (ts-jest, separate `unit` and `e2e` projects) and `frontend/vite.config.ts` + Vitest jsdom environment with dev proxy for `/api` and `/:code` to the backend
- [X] T010 [P] Add CI workflow at `.github/workflows/ci.yml` running `npm run check`, `npm test`, and `npm audit --audit-level=high` (constitution: CI gate)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Config, database, ID encoding, error handling, and security middleware that every story needs

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T011 Implement typed environment schema in `backend/src/config/env.ts`: validates `DATABASE_URL`, `BASE_URL`, `SQIDS_ALPHABET` (must be exactly 62 unique chars from `[0-9A-Za-z]`), `PORT`, both rate-limit values; fails fast at boot with a message that never echoes the values
- [X] T012 [P] Unit test in `backend/src/config/env.spec.ts`: boot fails on missing `DATABASE_URL`/`SQIDS_ALPHABET`, on a short or duplicate-character alphabet; assert log output never contains secret values (FR-017, constitution III)
- [X] T013 Define Drizzle schema in `backend/src/db/schema.ts` for table `links`: `id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`, `original_url TEXT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `expires_at TIMESTAMPTZ NULL` (per [data-model.md](data-model.md#table-links))
- [X] T014 Add CHECK constraints to the migration for `links`: `char_length(original_url) BETWEEN 1 AND 2048`, `original_url ~* '^https?://'` (case-insensitive, so an uppercase scheme stored verbatim per FR-008 is not rejected), and `expires_at IS NULL OR expires_at > created_at` (defence in depth for FR-002/FR-003)
- [X] T015 Configure `backend/drizzle.config.ts` and generate the initial migration into `backend/src/db/migrations/`; commit the generated SQL (constitution: versioned migrations, never hand-applied)
- [X] T016 Add a grants statement to the migration giving the application role only `SELECT, INSERT` on `links` and `USAGE` on its identity sequence — no `UPDATE`/`DELETE`/DDL (constitution: least privilege)
- [X] T017 Implement the database provider in `backend/src/db/client.ts`: `pg.Pool` (10–20 connections) plus the Drizzle instance, exported as a NestJS provider with graceful shutdown
- [X] T018 [P] Implement short-code encoding in `backend/src/links/short-code.ts`: `Sqids({ alphabet: env.SQIDS_ALPHABET, minLength: 6, blocklist: [...defaultBlocklist, 'assets', 'preview'] })`; `encode(id)` asserts `id <= Number.MAX_SAFE_INTEGER`; `decode(code)` returns an id only when exactly one number is returned AND `encode(decoded) === code` (canonical check), else null
- [X] T019 [P] Unit tests in `backend/src/links/short-code.spec.ts`: `encode(1..1_000_000)` all match `^[0-9A-Za-z]{6,10}$` (FR-006); `encode(n)` vs `encode(n+1)` differ in more than the last character across 1000 samples (FR-007); non-canonical and undecodable strings return null; round-trip `decode(encode(n)) === n`
- [X] T020 [P] Implement domain error classes and stable codes in `backend/src/common/errors.ts`: `INVALID_URL`, `VALIDATION_ERROR`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL` (matching [contracts/openapi.yaml](contracts/openapi.yaml) `ErrorEnvelope`). There is deliberately no `GONE` code: an expired link is a resource state, not an error — 410 responses carry a `LinkResponse` with `status: 'expired'` (JSON) or the expired HTML page, never an error envelope.
- [X] T020a [P] Implement `backend/src/links/expiry.ts`: the `ExpiryOption` type (`'1h' | '1d' | '7d' | '30d' | 'never'`) and `toExpiresAt(option, now)` returning `null` for `'never'` or `now + {1h, 24h, 168h, 720h}` from the server clock. Lives in Phase 2 because US1's `CreateLinkDto` (T033) references `ExpiryOption`.
- [X] T021 Implement the global exception filter in `backend/src/common/http-exception.filter.ts` mapping every error to `{ error: { code, message } }`, logging internals server-side only; no stack traces, SQL, or paths in responses (FR-017)
- [X] T022 Bootstrap the application in `backend/src/main.ts`: `helmet()`, `trust proxy`, global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`, the exception filter, and `app.useStaticAssets(frontend/dist/assets, { prefix: '/assets' })`; every other single-segment path must stay free for the redirect catch-all
- [X] T023 Wire `backend/src/app.module.ts` with the config, db, and links modules plus `ThrottlerModule` configured from env
- [X] T024 [P] Create the Testcontainers test harness in `backend/test/setup/` : starts PostgreSQL 16, runs `backend/src/db/migrations/`, exposes a per-suite `DATABASE_URL`, tears down after; no manually provisioned state (constitution IV)
- [X] T025 [P] Scaffold the frontend shell: `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/App.tsx` selecting the screen from `window.location.pathname` (`/` → shorten, `/p/:code` → preview; no router), and `frontend/src/styles.css`
- [X] T026 [P] Implement typed API client wrappers in `frontend/src/api/links.ts` (`createLink`, `getLink`) whose request/response types mirror [contracts/openapi.yaml](contracts/openapi.yaml)

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Shorten a long link (Priority: P1) 🎯 MVP

**Goal**: A visitor submits a long URL and receives a unique short link they can copy.

**Independent Test**: `POST /api/links` with a valid URL returns 201 with a 6-character
code and a `shortUrl`; invalid schemes, oversized URLs, and self-references are
rejected with 400. The home page renders the form and shows a copyable result.

### Tests for User Story 1 ⚠️

> Write these FIRST and confirm they FAIL before implementing T032–T039

- [X] T027 [P] [US1] Contract tests in `backend/test/contract/create-link.e2e-spec.ts`: creates a link with no authentication and returns 201 with `code`, `shortUrl`, `previewUrl`, `originalUrl`, `createdAt`, `expiresAt: null`, `status: 'active'` (FR-001); response shape matches `LinkResponse`
- [X] T028 [US1] Negative contract tests in the same file: rejects `ftp://`, `javascript:`, `data:`, `file:`, and scheme-less `example.com` with 400 `INVALID_URL` (FR-002); rejects a 2049-character URL and accepts a 2048-character URL with the limit stated in the message (FR-003); rejects a URL whose host equals the `BASE_URL` host (FR-004); accepts `HTTPS://example.com` and `HtTp://example.com` with 201, storing the scheme case verbatim (FR-008); rejects an unknown `expiry` value and unknown body properties with 400 `VALIDATION_ERROR`
- [X] T029 [US1] Contract test in `backend/test/contract/create-link.e2e-spec.ts`: posting the identical URL twice returns two different codes (FR-018, no deduplication)
- [X] T030 [P] [US1] Integration test in `backend/test/integration/links.repository.e2e-spec.ts`: 10,000 concurrent inserts yield 10,000 distinct ids with zero collisions (FR-005, SC-004)
- [X] T031 [P] [US1] Component tests in `frontend/tests/ShortenForm.test.tsx`: empty submission shows a validation message and issues no request; a submission over 2048 characters is blocked client-side; a server 400 renders the returned message

### Implementation for User Story 1

- [X] T032 [P] [US1] Implement URL validation in `backend/src/links/url-validation.ts`: trim then reject empty; reject length > 2048 with a message stating the limit; parse with the platform `new URL()` (never regex-only); require `protocol` in `{http:, https:}`; reject when lower-cased `hostname` equals the `BASE_URL` hostname; expose it as a `class-validator` custom decorator `IsHttpUrl`
- [X] T033 [P] [US1] Define `backend/src/links/dto/create-link.dto.ts` with `url: string` (`@IsHttpUrl()`) and optional `expiry: ExpiryOption` (`@IsIn(['1h','1d','7d','30d','never'])`), `additionalProperties: false` behaviour via the global `whitelist`/`forbidNonWhitelisted` pipe
- [X] T034 [P] [US1] Define the response mapper in `backend/src/links/dto/link.response.ts` deriving `code`, `shortUrl` (`${BASE_URL}/${code}`), `previewUrl` (`${BASE_URL}/p/${code}`), and `status` from a `Link` row (per [data-model.md](data-model.md#derived-values))
- [X] T035 [US1] Implement `backend/src/links/links.repository.ts` `insert({ originalUrl, expiresAt })` using `INSERT … RETURNING id, created_at` (one round-trip) and `findById(id)`; store `originalUrl` verbatim after trimming, not `url.href` (FR-008)
- [X] T036 [US1] Implement `create()` in `backend/src/links/links.service.ts`: validate → compute `expiresAt` via `toExpiresAt` from T020a (absent option ⇒ `null`) → insert → encode the returned id to a code → map to the response; never deduplicate (FR-018). This owns `expiresAt` end-to-end; US3 adds no further service-layer write logic.
- [X] T037 [US1] Implement `POST /api/links` in `backend/src/links/links.controller.ts` returning 201, wired to `LinksService`
- [X] T038 [US1] Apply the create-endpoint throttle (`RATE_LIMIT_CREATE_PER_HOUR`, default 60/hour/IP) to `POST /api/links` in `backend/src/links/links.controller.ts` (FR-015)
- [X] T039 [P] [US1] Implement `frontend/src/components/ShortenForm.tsx`: URL input with client-side non-empty and ≤2048 checks, submit handler calling `createLink`, and inline rendering of server error messages
- [X] T040 [P] [US1] Implement `frontend/src/components/ResultCard.tsx` showing the full short link and a one-action copy-to-clipboard button (FR-010)
- [X] T041 [P] [US1] Component tests in `frontend/tests/ResultCard.test.tsx`: renders the full short URL; the copy button writes it to the clipboard (FR-010)

**Checkpoint**: User Story 1 is fully functional — links can be created and copied, though nothing resolves them yet

---

## Phase 4: User Story 2 - Follow a short link (Priority: P1)

**Goal**: Opening a short link redirects to the original URL; unknown codes show a
"not found" page.

**Independent Test**: Seed a row directly via the repository, then `GET /:code`
returns 301 with the exact original URL in `Location`; an unissued or wrong-case code
returns 404 with no `Location`. Testable without US1's endpoint.

### Tests for User Story 2 ⚠️

- [X] T042 [P] [US2] Contract tests in `backend/test/contract/redirect.e2e-spec.ts`: `Location` equals the original URL verbatim including query string and fragment; internationalised domain names and percent-encoded paths round-trip unchanged (FR-008)
- [X] T043 [US2] Negative contract tests in the same file: an unissued code returns 404 with no `Location` header; a decodable-but-non-canonical string returns 404; a code differing only in letter case returns 404 (FR-009, case-sensitivity)
- [X] T044 [US2] Contract test in `backend/test/contract/redirect.e2e-spec.ts` asserting `X-Content-Type-Options`, frame-denial, and `Referrer-Policy` headers are present on every response, including static `/assets/*` responses (constitution III)
- [X] T045 [US2] Contract test in the same file: a forced repository failure returns 500 `{ error: { code: 'INTERNAL' } }` containing no stack trace, SQL, or internal path (FR-017)
- [X] T046 [US2] Integration test in `backend/test/integration/links.repository.e2e-spec.ts`: a link remains readable after the pool reconnects, proving durability across restarts (FR-014)

### Implementation for User Story 2

- [X] T047 [US2] Implement `resolve(code)` in `backend/src/links/links.service.ts`: decode with the canonical check → `findById` → return `notFound` when the code is undecodable or the row is missing
- [X] T048 [US2] Implement `GET /:code` in `backend/src/links/redirect.controller.ts` returning 301 with `Location: originalUrl` and `Cache-Control: public, max-age=86400` for permanent links (per [research.md §4](research.md)); register the route last so `/api` and `/p` take precedence
- [X] T049 [US2] Apply the redirect throttle (`RATE_LIMIT_REDIRECT_PER_MINUTE`, default 600/minute/IP) to `GET /:code`, ensuring create-endpoint limits never block redirects (FR-015)
- [X] T050 [US2] Implement the "link not found" state in `frontend/src/App.tsx` (404 page content), served as HTML by the backend for unknown codes with no redirect
- [X] T051 [US2] Serve the SPA HTML with the correct status for 404 responses in `backend/src/links/redirect.controller.ts` (HTML body, status preserved, no `Location`)

**Checkpoint**: US1 + US2 together form the complete MVP — links can be created, shared, and followed

---

## Phase 5: User Story 3 - Create a temporary short link (Priority: P2)

**Goal**: A visitor can choose an expiry; after it passes the link stops redirecting
and shows an "expired" page.

**Independent Test**: Create a link with `expiry: '1h'` and confirm 302 plus a correct
`expiresAt`; seed a row with `expires_at` in the past and confirm 410 with no
`Location`.

### Tests for User Story 3 ⚠️

- [X] T052 [P] [US3] Unit tests in `backend/src/links/expiry.spec.ts` covering `toExpiresAt` from T020a: each option maps to the correct offset (1h/1d/7d/30d); `'never'` and an absent value both yield `null`; an unknown value is rejected (FR-011)
- [X] T053 [US3] Contract tests in `backend/test/contract/create-link.e2e-spec.ts`: each expiry option returns the correct absolute `expiresAt` in ISO-8601 with offset, computed from the server clock; omitting `expiry` yields `expiresAt: null` (FR-011, FR-012)
- [X] T054 [US3] Contract tests in `backend/test/contract/redirect.e2e-spec.ts`: an unexpired temporary link returns 302 with `Cache-Control: no-store`; a link expiring one second in the future still redirects; a link expired one second ago returns 410 with no `Location` (FR-013)
- [X] T055 [US3] Contract test in `backend/test/contract/create-link.e2e-spec.ts`: shortening a URL whose earlier link has expired issues a new code and never revives the expired one (spec scenario 3.5)

### Implementation for User Story 3

- [X] T058 [US3] Extend `resolve(code)` in `backend/src/links/links.service.ts` to compute `status` (`expiresAt !== null && expiresAt <= now()` → `'expired'`) and return an expired outcome distinct from not-found
- [X] T059 [US3] Extend `backend/src/links/redirect.controller.ts`: 302 with `Cache-Control: no-store` for active temporary links, 410 with the "expired" HTML page and no `Location` for expired ones (FR-013)
- [X] T060 [US3] Add the expiry `<select>` (1 hour, 1 day, 7 days, 30 days, never; default never) to `frontend/src/components/ShortenForm.tsx` (FR-011)
- [X] T061 [US3] Display the absolute expiry date and time in `frontend/src/components/ResultCard.tsx`, rendered in the visitor's local timezone (FR-012)
- [X] T062 [US3] Add the "link expired" state to `frontend/src/App.tsx`, distinct in copy from "not found"
- [X] T063 [US3] Extend `frontend/tests/ResultCard.test.tsx` to assert the absolute expiry date/time renders for a temporary link (FR-012)

**Checkpoint**: US1 + US2 + US3 all work independently; temporary links expire correctly

---

## Phase 6: User Story 4 - Preview a short link before following it (Priority: P3)

**Goal**: A cautious recipient can see a short link's destination without being
redirected.

**Independent Test**: `GET /api/links/:code` returns the original URL, creation time,
and expiry without any redirect; `/p/:code` renders that data; unknown and expired
codes return 404/410 matching the redirect path.

### Tests for User Story 4 ⚠️

- [X] T064 [P] [US4] Contract tests in `backend/test/contract/preview.e2e-spec.ts`: returns `originalUrl`, `createdAt`, `expiresAt`, and `status` with no `Location` header and no 3xx status (FR-016)
- [X] T065 [US4] Negative contract tests in `backend/test/contract/preview.e2e-spec.ts`: an unknown code returns 404 and an expired code returns 410 with the body still present, matching the redirect path's status parity (FR-016)
- [X] T066 [P] [US4] Component tests in `frontend/tests/PreviewCard.test.tsx`: renders the full original URL as text, its creation date, its expiry when present, and never navigates automatically

### Implementation for User Story 4

- [X] T067 [US4] Implement `GET /api/links/:code` in `backend/src/links/links.controller.ts` returning `LinkResponse` with 200 for active links, 410 for expired links (body retained), and 404 for unknown codes
- [X] T068 [US4] Apply the redirect-tier throttle to `GET /api/links/:code` in `backend/src/links/links.controller.ts` so preview cannot be used to bypass enumeration limits
- [X] T069 [P] [US4] Implement `frontend/src/components/PreviewCard.tsx` showing the destination URL as text, creation date, expiry (if any), and an explicit "continue" link the visitor must click
- [X] T070 [US4] Route `/p/:code` in `frontend/src/App.tsx` to `PreviewCard`, fetching via `getLink` and rendering the not-found and expired states from the response status
- [X] T071 [US4] Serve the SPA `index.html` for `GET /p/:code` from `backend/src/links/pages.controller.ts`, registered before the `/:code` catch-all. Static middleware cannot serve an index file for a parameterised path, so the controller owns `/` and `/p/:code` while `useStaticAssets` owns `/assets/**`

**Checkpoint**: All four user stories are independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T072 [P] Write `README.md` at the repository root covering setup, environment variables, the `npm run check` / `npm test` gate, and a warning that `SQIDS_ALPHABET` must never change after launch (it invalidates every issued link)
- [X] T073 [P] Create `CLAUDE.md` at the repository root with the runtime development guidance required by the constitution's Governance section, consistent with `.specify/memory/constitution.md`
- [X] T074 Run the full quickstart validation in [quickstart.md](quickstart.md#manual-validation-scenarios) against a running instance and record any deviation
- [X] T075 Verify every FR and SC in the [test matrix](quickstart.md#automated-test-matrix) maps to a passing test, explicitly recording the mapping for FR-019 (contract tests + `contracts/openapi.yaml`), SC-005 (T028), SC-006 (T054), SC-007 (T046), and SC-008 (T019); a missing test for a stated requirement is a blocking finding (constitution IV). SC-001 (30-second first-use) is verified by a manual walkthrough, not an automated test.
- [X] T076 [P] Add a load check confirming 1,000 redirects/second and 50 creates/second with zero failed requests and redirect p99 under 300 ms (SC-002, SC-003), run with `RATE_LIMIT_REDIRECT_PER_MINUTE` raised so the component under test is the service and not the throttler; document the result and the override in [load-results.md](load-results.md)
- [X] T077 Security hardening pass: confirm `helmet` headers on all routes, `429` responses carry `Retry-After`, error bodies leak nothing internal, and `npm audit --audit-level=high` is clean (constitution III)
- [X] T078 Run `npm run check` and `npm test` from a clean checkout with only Docker installed, confirming the single-command gate works with no manual state (constitution IV)

---

## Phase 8: Unguessable short codes (amendment 2026-09-25, constitution 1.1.0)

**Purpose**: Treat short codes as bearer secrets. Random stored codes replace Sqids,
unknown-code lookups get their own per-client budget, every limit is keyed per IPv6
/64, and expired links stop revealing their destination
([research.md §1, §2, §5, §6](research.md)).

**Independent Test**: A created code is 11 characters and resolves; 20 unknown codes
from one client exhaust its budget and the 21st lookup, even of a real code, returns
429; an expired link's preview body carries no `originalUrl`.

### Design

- [X] T079 Amend `.specify/memory/constitution.md` to 1.1.0: codes are CSPRNG bearer secrets with ≥ 64 bits of entropy, unknown-code lookups are limited per client and IPv6 /64, expired links withhold their destination
- [X] T080 Amend [spec.md](spec.md): FR-006 (exactly 11 characters), FR-007 (independently random), FR-013 (expired pages withhold the URL), FR-020 (unknown-code limit), SC-008, SC-009, threat-model assumption
- [X] T081 Amend [research.md](research.md) §1, §2, §5, §6, §8, [plan.md](plan.md), [data-model.md](data-model.md), [contracts/openapi.yaml](contracts/openapi.yaml) (2.0.0) and [quickstart.md](quickstart.md)

### Random stored codes (FR-005, FR-006, FR-007)

- [X] T082 [P] Unit tests in `backend/src/links/short-code.spec.ts`: generated codes match `^[0-9A-Za-z]{11}$`; with a stub random source every alphabet character is reachable at every position; `isWellFormedCode` rejects wrong lengths and characters; no reserved first path segment (`api`, `p`, `assets`) has `CODE_LENGTH` characters
- [X] T083 [P] Replace the Sqids codec in `backend/src/links/short-code.ts` with `CODE_LENGTH = 11`, `generateCode()` drawing each character with `crypto.randomInt(62)`, and `isWellFormedCode()`; replace `short-codec.provider.ts` with `code-generator.provider.ts` (`CODE_GENERATOR` token)
- [X] T084 Add migration `backend/src/db/migrations/0002_random_codes.sql` and update `backend/src/db/schema.ts`: drop the identity-keyed `links`, create it keyed by `code TEXT COLLATE "C"` with `CHECK (code ~ '^[0-9A-Za-z]{11}$')`, and grant the app role `SELECT, INSERT` only
- [X] T085 Repository in `backend/src/links/links.repository.ts`: `insert` takes the code and uses `ON CONFLICT (code) DO NOTHING RETURNING *`, returning `null` on a clash; `findById` becomes `findByCode`. Integration tests in `backend/test/integration/links.repository.e2e-spec.ts`: a duplicate code returns `null` and leaves the first row intact; 10,000 concurrent inserts of generated codes all succeed with distinct codes (SC-004)
- [X] T086 Service in `backend/src/links/links.service.ts`: `create` draws a code and retries on a clash, failing with 500 `INTERNAL` after 3 attempts; `resolve` answers not-found without a query for a malformed code. Unit tests in `backend/src/links/links.service.spec.ts` with a fake repository
- [X] T087 Remove `sqids` and `SQIDS_ALPHABET` (`env.ts`, `env.spec.ts`, `.env.example`, test setup, `env-file.e2e-spec.ts`); update contract tests for 11-character codes and the frontend route pattern in `frontend/src/App.tsx`; rewrite the short-code sections of `README.md` and `CLAUDE.md`

### Expired links withhold their destination (FR-013)

- [X] T088 Contract tests in `backend/test/contract/preview.e2e-spec.ts` and `redirect.e2e-spec.ts`: the 410 JSON body is exactly `{ code, status: 'expired', expiresAt }`; neither 410 response contains the original URL
- [X] T089 Add `ExpiredLinkResponse` in `backend/src/links/dto/link.response.ts` and return it from the resolve path; mirror the type in `frontend/src/api/links.ts` and render the expired preview without a destination in `frontend/src/components/PreviewCard.tsx`, with tests in `frontend/tests/PreviewCard.test.tsx` and `StatusScreen.test.tsx`

### Unknown-code limit and /64 keying (FR-015, FR-020)

- [X] T090 [P] Contract test in `backend/test/contract/rate-limit.e2e-spec.ts`: two addresses in one IPv6 /64 share the create limit, and another /64 does not
- [X] T091 Key every throttler per IPv6 /64: `@nestjs/throttler` does so by default since 6.7 (`normalizeIp`), so raise the dependency floor to 6.7 and set `ipv6SubnetPrefix: 64` explicitly in `backend/src/app.module.ts` rather than hand-rolling an address parser
- [X] T092 [P] Unit tests in `backend/src/links/unknown-code-limiter.spec.ts` with an injected clock: the budget is refused once spent and restored when the window ends; a spent budget refuses hits too; hits return their reservation; concurrent in-flight lookups cannot overrun the budget; `Retry-After` reflects the window; idle clients are swept
- [X] T093 Implement `backend/src/links/unknown-code-limiter.ts` and `unknown-code.guard.ts`, configured by `RATE_LIMIT_UNKNOWN_CODE_PER_10_MINUTES` (default 20) and applied to `GET /:code` and `GET /api/links/:code`; document the variable in `.env.example`, `README.md` and `CLAUDE.md`
- [X] T094 Contract tests in `backend/test/contract/unknown-code-limit.e2e-spec.ts`: redirect and preview share one budget; the exhausted budget returns 429 with `Retry-After` for a real code; hits never consume it; another client is unaffected; two addresses in one IPv6 /64 share a budget, two /64s do not

### Verification

- [ ] T095 Re-run the load check (`npm run load -w backend`) with the new codes and record the result in [load-results.md](load-results.md)
- [ ] T096 Run `npm run check` and `npm test` from a clean checkout and confirm the collected test count grew by the new suites

**Checkpoint**: Codes are unguessable, guessing is bounded per client, and no response
reveals a destination to someone who does not hold its code

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**
- **US1 (Phase 3)** and **US2 (Phase 4)**: Both P1; depend only on Foundational
- **US3 (Phase 5)**: Depends on Foundational; extends US1's create path and US2's redirect path
- **US4 (Phase 6)**: Depends on Foundational; independent of US3
- **Polish (Phase 7)**: Depends on all desired stories being complete
- **Unguessable codes (Phase 8)**: Depends on Phases 1–7. T082–T087 land together (the
  schema, repository and service change in step); T088–T089 and T090–T094 are
  independent of each other and follow T087

### User Story Dependencies

- **US1 (P1)**: Independent after Phase 2
- **US2 (P1)**: Independent after Phase 2 — tests seed rows through the repository rather than through US1's endpoint, so it can be built and verified in parallel with US1
- **US3 (P2)**: Independently testable, but its tasks edit `links.service.ts`, `redirect.controller.ts`, `ShortenForm.tsx`, and `ResultCard.tsx`, which US1/US2 create. Sequence it after them rather than in parallel to avoid same-file conflicts. Its `ExpiryOption` type and `toExpiresAt` helper live in Phase 2 (T020a) because US1's DTO references them, and the create path already persists `expiresAt` (T036), so US3 adds only the resolve-side expiry check, the redirect behaviour, and the UI.
- **US4 (P3)**: Independently testable; touches `links.controller.ts` (shared with US1) and adds new files elsewhere

### Within Each User Story

- Tests are written first and MUST fail before implementation (constitution IV)
- Validation and encoding helpers before services; services before controllers
- Backend endpoint before the frontend component that calls it

### Parallel Opportunities

- Phase 1: T002–T010 all run in parallel after T001
- Phase 2: T012, T018–T020, T020a, T024–T026 run in parallel; T013→T014→T015→T016 are sequential (same migration), and T017 follows T015
- Phase 3: T027, T030, and T031 run in parallel (distinct files); T028 and T029 append to the same spec file as T027, so they follow it. Then T032–T034 in parallel; T039 and T040 in parallel with backend work, T041 after T040
- Phase 4: T042 starts the redirect spec; T043–T045 append to the same file and follow it; T046 runs in parallel (different file)
- Phase 5: T052 runs in parallel; T053/T055 append to the create-link spec and T054 to the redirect spec, so each follows the task that created its file; T060–T063 are sequential per file once T058–T059 land
- Phase 6: T064–T066 in parallel
- With two developers, US1 and US2 can run concurrently after Phase 2

---

## Parallel Example: User Story 1

```bash
# US1 tests that touch distinct files run together (they must fail):
Task: "Contract tests for POST /api/links happy path in backend/test/contract/create-link.e2e-spec.ts"
Task: "10,000-concurrent-insert uniqueness test in backend/test/integration/links.repository.e2e-spec.ts"
Task: "ShortenForm component tests in frontend/tests/ShortenForm.test.tsx"

# T028 and T029 append to create-link.e2e-spec.ts, so they follow T027.

# Then the independent implementation units:
Task: "URL validation in backend/src/links/url-validation.ts"
Task: "CreateLinkDto in backend/src/links/dto/create-link.dto.ts"
Task: "Link response mapper in backend/src/links/dto/link.response.ts"
```

---

## Implementation Strategy

### MVP scope

The MVP is **US1 + US2 together** (both P1). A shortener that creates links but cannot
resolve them delivers nothing to a recipient, and the spec marks both stories as
co-equal: "together they form the minimum viable product". Stop after Phase 4, run the
quickstart scenarios for US1 and US2, and the service is demonstrable.

### Incremental delivery

1. Phase 1 + Phase 2 → foundation ready
2. Phase 3 + Phase 4 → **MVP**: create, share, follow → validate → demo
3. Phase 5 → temporary links → validate → demo
4. Phase 6 → preview → validate → demo
5. Phase 7 → polish, load check, security pass

### Parallel team strategy

1. Everyone completes Phase 1 + Phase 2 (T013–T017 are a single-owner chain; the rest fan out)
2. Then: Developer A takes US1, Developer B takes US2
3. US3 follows US1/US2 (shared files); US4 can run alongside US3 once US1's controller exists

---

## Notes

- `[P]` means a different file with no incomplete dependency
- Phases 1–7 built codes as a Sqids encoding of an identity column; Phase 8 replaces them with random stored codes ([research.md §1](research.md)). Earlier task text is kept as the record of what was built at the time
- Codes need no coordination between instances; the documented scaling path (LRU → replicas → hash sharding of the code) requires no schema or API change and is **not** built in this feature
- Private/loopback address rejection is explicitly out of scope for v1 ([research.md §7](research.md))
- Commit after each task or logical group; one task per change (constitution V)
