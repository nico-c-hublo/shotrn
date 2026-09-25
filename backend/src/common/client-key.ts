import { normalizeIp } from '@nestjs/throttler';

/**
 * Every rate limit counts per IPv4 address or IPv6 /64 (research.md §6). A subscriber is
 * routinely given a whole /64, so keying on the full address could be escaped by rotation.
 */
export const IPV6_CLIENT_PREFIX = 64;

/** The throttler's own normalisation, so every limit agrees on who a client is. */
export function clientKey(ip: string | undefined): string {
  // No address means the socket is already gone; one shared bucket is the cautious choice.
  return ip ? normalizeIp(ip, IPV6_CLIENT_PREFIX) : 'unknown';
}
