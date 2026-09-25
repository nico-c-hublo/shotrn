import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Response } from 'express';

export const FRONTEND_DIST = join(__dirname, '..', '..', '..', 'frontend', 'dist');
export const SPA_INDEX_PATH = join(FRONTEND_DIST, 'index.html');
/** Vite emits hashed bundles here; they are served at the /assets prefix. */
export const FRONTEND_ASSETS = join(FRONTEND_DIST, 'assets');

/**
 * Fallback used when the frontend has not been built (tests, API-only runs). Keeps the
 * user-facing copy identical to the SPA's own not-found/expired screens.
 */
const FALLBACK = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Shotrn</title></head>
<body><div id="root"></div></body></html>`;

let cached: string | null = null;

function indexHtml(): string {
  if (cached !== null) return cached;
  cached = existsSync(SPA_INDEX_PATH) ? readFileSync(SPA_INDEX_PATH, 'utf8') : FALLBACK;
  return cached;
}

/**
 * Why a code could not be followed. Stated in the page itself so the SPA's status screen
 * does not look the code up again, which the unknown-code limit would charge a second
 * time (research.md §6). Mirrored by `frontend/src/served-outcome.ts`.
 */
export type ServedOutcome = { kind: 'not-found' } | { kind: 'expired'; expiresAt: string };

/** Sends the SPA shell with an explicit status so 404/410 stay accurate for crawlers and tests. */
export function sendSpa(res: Response, status: number, outcome?: ServedOutcome): void {
  const html = indexHtml();
  res
    .status(status)
    .type('html')
    .send(outcome ? html.replace('</head>', `${outcomeTags(outcome)}</head>`) : html);
}

function outcomeTags(outcome: ServedOutcome): string {
  // Neither a fixed keyword nor an ISO-8601 timestamp contains a character that needs
  // escaping in an attribute; the destination is never part of it (FR-013).
  const status = `<meta name="shotrn-link-status" content="${outcome.kind}">`;
  if (outcome.kind === 'not-found') return status;
  return `${status}<meta name="shotrn-link-expires-at" content="${outcome.expiresAt}">`;
}
