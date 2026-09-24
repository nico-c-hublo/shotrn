/** Fixed set of expiry choices offered at creation time (FR-011). */
export const EXPIRY_OPTIONS = ['1h', '1d', '7d', '30d', 'never'] as const;

export type ExpiryOption = (typeof EXPIRY_OPTIONS)[number];

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const DURATIONS: Record<Exclude<ExpiryOption, 'never'>, number> = {
  '1h': HOUR,
  '1d': DAY,
  '7d': 7 * DAY,
  '30d': 30 * DAY,
};

export function isExpiryOption(value: unknown): value is ExpiryOption {
  return typeof value === 'string' && (EXPIRY_OPTIONS as readonly string[]).includes(value);
}

/**
 * Absolute expiry computed from the server clock, never the caller's (spec edge case:
 * a visitor with a wrong device clock must still get the expiry the service promised).
 */
export function toExpiresAt(option: ExpiryOption | undefined, now: Date = new Date()): Date | null {
  if (option === undefined || option === 'never') return null;
  return new Date(now.getTime() + DURATIONS[option]);
}
