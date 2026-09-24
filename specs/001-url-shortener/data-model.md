# Data Model: URL Shortener

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-09-22

One table. The short code is not a column — it is derived from `id` (see
[research.md §1–2](research.md)).

## Table `links`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `BIGINT` | `GENERATED ALWAYS AS IDENTITY`, PK | Sole ID source; `code = sqids.encode([id])` |
| `original_url` | `TEXT` | `NOT NULL`, `CHECK (char_length(original_url) BETWEEN 1 AND 2048)` | Stored exactly as submitted after trim (FR-008); scheme allow-list enforced at API boundary, and by `CHECK (original_url ~* '^https?://')` (case-insensitive: an uppercase scheme is stored verbatim per FR-008) as defence in depth |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Server clock |
| `expires_at` | `TIMESTAMPTZ` | `NULL` | `NULL` = permanent. `CHECK (expires_at IS NULL OR expires_at > created_at)` |

**Indexes**: primary key only. No lookup by `original_url` (no dedup, FR-018) and no
lookup by expiry in v1 (purge job is deferred; when added, a partial index
`WHERE expires_at IS NOT NULL` suffices).

**Database role**: application connects as a role with `SELECT, INSERT` on `links` and
`USAGE` on its sequence only; migrations run under a separate owner role
(constitution: least privilege, no DDL at runtime). `UPDATE`/`DELETE` are not granted —
v1 never modifies a link.

## Domain types (backend)

```ts
type LinkId = bigint;                 // from pg; asserted ≤ Number.MAX_SAFE_INTEGER before encode
type ShortCode = string;              // [0-9A-Za-z]{6,10}, canonical Sqids output
type ExpiryOption = '1h' | '1d' | '7d' | '30d' | 'never';

interface Link {
  id: LinkId;
  originalUrl: string;
  createdAt: Date;
  expiresAt: Date | null;
}

type LinkStatus = 'active' | 'expired';
```

## Derived values

| Value | Derivation |
|---|---|
| `code` | `sqids.encode([Number(id)])` |
| `id` from `code` | `sqids.decode(code)`; valid only if exactly one number is returned **and** `sqids.encode(decoded) === code` (canonical check) |
| `shortUrl` | `${BASE_URL}/${code}` |
| `previewUrl` | `${BASE_URL}/p/${code}` |
| `status` | `expiresAt !== null && expiresAt <= now()` → `'expired'` else `'active'` |
| `expiresAt` from `ExpiryOption` | `never → null`; else `now() + {1h: 1h, 1d: 24h, 7d: 168h, 30d: 720h}` |

## Validation rules (API boundary)

Applied in order; first failure wins and yields `400 INVALID_URL` (or
`400 VALIDATION_ERROR` for shape/enum errors):

1. `url` present, string, trimmed non-empty.
2. `url.length ≤ 2048` → else message states the limit (FR-003).
3. `new URL(url)` parses.
4. `protocol ∈ {http:, https:}` (FR-002).
5. `hostname.toLowerCase() !== new URL(BASE_URL).hostname` (FR-004).
6. `expiry` absent or `∈ ExpiryOption` (FR-011). Absent ⇒ `'never'`.

## State transitions

`Link` has no mutable state. Its observable status is a pure function of `expiresAt`
and the current time:

```text
created ──(expires_at == null)──────────────▶ active forever
created ──(expires_at != null, now < expires_at)──▶ active
active  ──(now ≥ expires_at)────────────────▶ expired   (irreversible; row retained)
```

There is no delete, disable, or edit transition in v1.

## Resolution outcomes (redirect & preview)

| Input | Outcome | HTTP |
|---|---|---|
| Non-canonical / undecodable code | not found | 404 |
| Decodes to id with no row | not found | 404 |
| Row found, `status = active` | redirect (or preview JSON) | 301 (permanent) / 302 (temporary); preview 200 |
| Row found, `status = expired` | expired page (or preview JSON with `status: expired`) | 410 |
