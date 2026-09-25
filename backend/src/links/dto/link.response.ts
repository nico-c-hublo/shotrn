import type { LinkRow } from '../../db/schema';

export type LinkStatus = 'active' | 'expired';

export interface LinkResponse {
  code: string;
  shortUrl: string;
  previewUrl: string;
  originalUrl: string;
  createdAt: string;
  expiresAt: string | null;
  status: LinkStatus;
}

export function linkStatus(expiresAt: Date | null, now: Date = new Date()): LinkStatus {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime() ? 'expired' : 'active';
}

export function toLinkResponse(
  row: LinkRow,
  baseUrl: string,
  now: Date = new Date(),
): LinkResponse {
  return {
    code: row.code,
    shortUrl: `${baseUrl}/${row.code}`,
    previewUrl: `${baseUrl}/p/${row.code}`,
    originalUrl: row.originalUrl,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    status: linkStatus(row.expiresAt, now),
  };
}
