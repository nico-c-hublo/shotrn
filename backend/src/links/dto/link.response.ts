import type { LinkRow } from '../../db/schema';

/** An active link, as returned on creation and by the preview endpoint. */
export interface LinkResponse {
  code: string;
  shortUrl: string;
  previewUrl: string;
  originalUrl: string;
  createdAt: string;
  expiresAt: string | null;
  status: 'active';
}

/**
 * An expired link (FR-013). A separate type rather than `LinkResponse` minus a field, so
 * that putting the destination back is a compile error: someone guessing codes must learn
 * no more from an expired link than that it existed and when it ended.
 */
export interface ExpiredLinkResponse {
  code: string;
  status: 'expired';
  expiresAt: string;
}

/** Narrows `expiresAt` to a Date, since only a temporary link can expire. */
export function isExpired(expiresAt: Date | null, now: Date = new Date()): expiresAt is Date {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

export function toLinkResponse(row: LinkRow, baseUrl: string): LinkResponse {
  return {
    code: row.code,
    shortUrl: `${baseUrl}/${row.code}`,
    previewUrl: `${baseUrl}/p/${row.code}`,
    originalUrl: row.originalUrl,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    status: 'active',
  };
}

export function toExpiredLinkResponse(code: string, expiresAt: Date): ExpiredLinkResponse {
  return { code, status: 'expired', expiresAt: expiresAt.toISOString() };
}
