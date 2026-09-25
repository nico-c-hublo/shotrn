# Quickstart: URL Shortener

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) |
**Contract**: [contracts/openapi.yaml](contracts/openapi.yaml)

This is the validation/run guide. It proves the feature end-to-end; it does not
contain implementation code.

## Prerequisites

- Node.js 22 LTS, npm 10
- Docker (for local Postgres via `docker-compose.yml` and for Testcontainers in tests)

## Setup

```bash
cp .env.example .env            # then set PUBLIC_BASE_URL if not localhost
npm install                     # installs both workspaces
docker compose up -d postgres   # local dev database
npm run db:migrate -w backend   # applies drizzle migrations
```

Environment variables (all validated at boot; missing/invalid ⇒ process exits):

| Var | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://app:app@localhost:5432/shotrn` | App role: SELECT/INSERT only |
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Used for `shortUrl` and self-reference check |
| `PORT` | `3000` | |
| `RATE_LIMIT_CREATE_PER_HOUR` | `60` | FR-015 |
| `RATE_LIMIT_REDIRECT_PER_MINUTE` | `600` | |

## Run

```bash
npm run dev            # backend on :3000 + Vite dev server on :5173 (proxies /api and /:code)
# or production-like:
npm run build && npm start   # backend serves frontend/dist at / and /p/:code
```

## Quality gate (constitution §Development Workflow)

```bash
npm run check   # tsc --noEmit + eslint + prettier --check, both workspaces
npm test        # unit + contract + integration (Testcontainers) + frontend
npm audit --audit-level=high
```

All three must pass before push. CI runs the same.

## Manual validation scenarios

Replace `$B` with your `PUBLIC_BASE_URL`.

### US1 — Shorten a link

```bash
curl -s -X POST $B/api/links -H 'content-type: application/json' \
  -d '{"url":"https://example.com/very/long/path?x=1#frag"}'
# expect 201, body with code (13 chars), shortUrl, expiresAt: null, status: active

curl -s -X POST $B/api/links -H 'content-type: application/json' -d '{"url":"javascript:alert(1)"}'
# expect 400 { error: { code: INVALID_URL, message mentions http/https } }

curl -s -X POST $B/api/links -H 'content-type: application/json' -d "{\"url\":\"https://x.io/$(head -c 2100 /dev/zero | tr '\0' a)\"}"
# expect 400 with message stating the 2048 limit

curl -s -X POST $B/api/links -H 'content-type: application/json' -d "{\"url\":\"$B/abc123\"}"
# expect 400 INVALID_URL (self-reference)

# Same URL twice → two different codes (FR-018)
```

### US2 — Follow a link

```bash
curl -si $B/<code> | head -5
# expect 301, Location: https://example.com/very/long/path?x=1#frag, Cache-Control: public, max-age=86400

curl -si $B/zzzzzzzzzzzzz | head -1 # expect 404 (HTML page, no Location header)
curl -si $B/<CODE-in-other-case>    # expect 404 — codes are case-sensitive
```

### US3 — Temporary link

```bash
curl -s -X POST $B/api/links -H 'content-type: application/json' -d '{"url":"https://example.com/offer","expiry":"1h"}'
# expect 201, expiresAt = now + 1h (ISO-8601 with offset), status: active
curl -si $B/<code> | head -3        # expect 302 + Cache-Control: no-store
# After expiry (or with a test that sets expires_at in the past):
curl -si $B/<code> | head -1        # expect 410, HTML "expired" page, no Location
curl -s $B/api/links/<code>         # expect 410 { code, status: expired, expiresAt } — no originalUrl
```

### US4 — Preview

```bash
curl -s $B/api/links/<code>          # 200 JSON with originalUrl, createdAt, expiresAt, status
open $B/p/<code>                     # page shows destination without redirecting
curl -s -o /dev/null -w '%{http_code}' $B/api/links/zzzzzzzzzzzzz   # 404
```

### Rate limiting (FR-015)

```bash
for i in $(seq 1 61); do curl -s -o /dev/null -w '%{http_code}\n' -X POST $B/api/links \
  -H 'content-type: application/json' -d '{"url":"https://example.com/"}'; done | sort | uniq -c
# expect 60× 201 and 1× 429 (with Retry-After); redirects still work meanwhile
```

### Lookup limit (FR-020)

```bash
for i in $(seq 1 601); do curl -s -o /dev/null -w '%{http_code}\n' $B/zzzzzzzzzzz$(printf %02d $((i % 100))); done | sort | uniq -c
# expect 600× 404 and 1× 429 (Retry-After: 60); unknown codes never lock a visitor out beyond that window
```

### Durability (FR-014)

```bash
# create a link, then:
docker compose restart postgres && npm start   # (or restart the backend container)
curl -si $B/<code> | head -1                   # still 301/302
```

## Automated test matrix

Every FR maps to at least one test. Names are the intended test titles; files are
from the plan's structure.

| Requirement | Test file | Test |
|---|---|---|
| FR-001 | `test/contract/create-link.e2e-spec.ts` | creates a link without auth and returns 201 |
| FR-002 | same | rejects `ftp:`, `javascript:`, `data:`, `file:`, scheme-less input with 400 INVALID_URL |
| FR-003 | same | rejects 2049-char URL, accepts 2048-char URL; message contains "2048" |
| FR-004 | same | rejects URL whose host equals PUBLIC_BASE_URL host |
| FR-005, SC-004 | `test/integration/links.repository.e2e-spec.ts` + `src/links/links.service.spec.ts` | 10,000 concurrent creations yield 10,000 distinct codes; a duplicate code is refused without overwriting; a clash is answered with a fresh draw |
| FR-006, SC-008 | `src/links/short-code.spec.ts` | generated codes match `^[0-9A-Za-z]{13}$`; every alphabet character reachable at every position |
| FR-007 | `src/links/short-code.spec.ts` + `test/contract/create-link.e2e-spec.ts` | codes come from `crypto.randomInt`, not from any counter; no configuration value reproduces them |
| FR-008 | `test/contract/redirect.e2e-spec.ts` | Location equals original incl. query and fragment; IDN and percent-encoded paths round-trip |
| FR-009 | same | unknown code → 404, no Location; malformed code → 404 without a query |
| FR-010 | `frontend/tests/ResultCard.test.tsx` | shows full short URL; copy button writes to clipboard |
| FR-011 | `test/contract/create-link.e2e-spec.ts` + `src/links/expiry.spec.ts` | each option maps to correct offset; absent ⇒ null; unknown ⇒ 400 |
| FR-012 | `frontend/tests/ResultCard.test.tsx` | renders absolute expiry date/time for temporary link |
| FR-013 | `test/contract/redirect.e2e-spec.ts` + `test/contract/preview.e2e-spec.ts` + `frontend/tests/PreviewCard.test.tsx` | expired link → 410, no Location; 1 s before expiry → 302; expired preview body and page never contain the original URL |
| FR-014 | `test/integration/links.repository.e2e-spec.ts` | link readable after pool reconnect / container restart |
| FR-015 | `test/contract/create-link.e2e-spec.ts` | 61st create in window → 429 with Retry-After; GET /:code unaffected |
| FR-016 | `test/contract/preview.e2e-spec.ts` | GET /api/links/:code returns metadata, never redirects; 404/410 parity with redirect |
| FR-017 | `test/contract/*.e2e-spec.ts` | forced repository failure → 500 `{ error: { code: INTERNAL } }` with no stack or SQL in body |
| FR-018 | `test/contract/create-link.e2e-spec.ts` | posting the same URL twice yields two different codes |
| FR-019 | `contracts/openapi.yaml` | contract tests assert response shapes against the schema |
| FR-020, SC-009 | `test/contract/rate-limit.e2e-spec.ts` | lookups beyond the limit are refused with 429 for known and unknown codes alike; IPv6 addresses in one /64 share a limit; SC-009 follows from code length (research §2) |
| Security headers | `test/contract/redirect.e2e-spec.ts` | `X-Content-Type-Options`, `X-Frame-Options`/CSP, `Referrer-Policy` present on every response |
| Secrets | `src/config/env.spec.ts` | boot fails on missing DATABASE_URL; log output never contains its value |

## Expected outcome

`npm run check && npm test && npm audit --audit-level=high` is green, every manual
scenario above returns the stated status, and the Constitution Check in
[plan.md](plan.md) still passes.
