import { randomInt } from 'node:crypto';

/** The 62 characters a short code may contain (FR-006). */
export const CODE_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * 62¹¹ ≈ 2^65.5: above the 64-bit floor for bearer secrets (research.md §2). Fixed length
 * also means no code can shadow a reserved first path segment, none of which is this long.
 */
export const CODE_LENGTH = 11;

const WELL_FORMED = new RegExp(`^[0-9A-Za-z]{${CODE_LENGTH}}$`);

/** Returns an integer in [0, max). Injected only so tests can drive every outcome. */
export type RandomIndex = (max: number) => number;

/**
 * Draws a fresh code. Every character is independent and uniform — `randomInt` rejects
 * biased samples internally — so no issued code says anything about another (FR-007).
 */
export function generateCode(randomIndex: RandomIndex = randomInt): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_CHARS[randomIndex(CODE_CHARS.length)];
  return code;
}

/** True when `code` could have been issued; anything else can be answered without a query. */
export function isWellFormedCode(code: string): boolean {
  return WELL_FORMED.test(code);
}
