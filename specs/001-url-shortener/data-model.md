# Data Model: URL Shortener

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-09-22

One table, keyed by the short code. The code is random and stored (see
[research.md §1–2](research.md); amended 2026-09-25, replacing a Sqids-derived code).

## Table `links`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `code` | `TEXT COLLATE "C"` | PK, `CHECK (code ~ '^[0-9A-Za-z]{11}$')` | 11 CSPRNG-drawn characters; the unique index resolves concurrent duplicates. Byte-order collation: see research §2 |
| `original_url` | `TEXT` | `NOT NULL`, `CHECK (char_length(original_url) BETWEEN 1 AND 2048)` | Stored exactly as submitted after trim (FR-008); scheme allow-list enforced at API boundary, and by `CHECK (original_url ~* '^https?://')` (case-insensitive: an uppercase scheme is stored verbatim per FR-008) as defence in depth |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Server clock |
| `expires_at` | `TIMESTAMPTZ` | `NULL` | `NULL` = permanent. `CHECK (expires_at IS NULL OR expires_at > created_at)` |

**Indexes**: primary key (`code`) only. No lookup by `original_url` (no dedup, FR-018) and no
lookup by expiry in v1 (purge job is deferred; when added, a partial index
`WHERE expires_at IS NOT NULL` suffices).

**Database role**: application connects as a role with `SELECT, INSERT` on `links`
only (there is no sequence); migrations run under a separate owner role
(constitution: least privilege, no DDL at runtime). `UPDATE`/`DELETE` are not granted —
v1 never modifies a link.

## Domain types (backend)

```ts
type ShortCode = string;              // [0-9A-Za-z]{11}, drawn with crypto.randomInt
type ExpiryOption = '1h' | '1d' | '7d' | '30d' | 'never';

interface Link {
  code: ShortCode;
  originalUrl: string;
  createdAt: Date;
  expiresAt: Date | null;
}

type LinkStatus = 'active' | 'expired';
```

## Derived values

| Value | Derivation |
|---|---|
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
| Client over its unknown-code budget | refused before lookup | 429 |
| Not 11 characters of `[0-9A-Za-z]` | not found, no query issued; not charged (it reveals nothing) | 404 |
| Well-formed, no row | not found; counts as a miss | 404 |
| Row found, `status = active` | redirect (or preview JSON `LinkResponse`) | 301 (permanent) / 302 (temporary); preview 200 |
| Row found, `status = expired` | expired page (or preview JSON `ExpiredLinkResponse`: `code`, `status`, `expiresAt`; never `originalUrl`) | 410 |

## Creation

```text
repeat up to 3 times:
  code ← 11 × CODE_CHARS[crypto.randomInt(62)]
  INSERT … VALUES (code, …) ON CONFLICT (code) DO NOTHING RETURNING *
  a row came back → done
fail the request (500): three collisions in a 5.2×10¹⁹ space mean a broken random source
```

## Migration from the Sqids schema

`0002_random_codes.sql` drops the identity-keyed table and creates the code-keyed one.
No deployment exists, so there is no data to carry over, and it could not be carried
over usefully anyway: every issued Sqids code is recoverable from the alphabet, so
keeping those links reachable would keep them exposed. Local development databases
lose their links when the migration runs.
