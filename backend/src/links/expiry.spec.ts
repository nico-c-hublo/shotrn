import { EXPIRY_OPTIONS, isExpiryOption, toExpiresAt } from './expiry';

const NOW = new Date('2026-09-24T12:00:00.000Z');

describe('expiry', () => {
  it.each([
    ['1h', '2026-09-24T13:00:00.000Z'],
    ['1d', '2026-09-25T12:00:00.000Z'],
    ['7d', '2026-10-01T12:00:00.000Z'],
    ['30d', '2026-10-24T12:00:00.000Z'],
  ] as const)('maps %s to the correct absolute instant', (option, expected) => {
    expect(toExpiresAt(option, NOW)?.toISOString()).toBe(expected);
  });

  it('treats "never" and an absent option as permanent', () => {
    expect(toExpiresAt('never', NOW)).toBeNull();
    expect(toExpiresAt(undefined, NOW)).toBeNull();
  });

  it('accepts exactly the documented options', () => {
    for (const option of EXPIRY_OPTIONS) expect(isExpiryOption(option)).toBe(true);
    for (const bad of ['2h', '', 'forever', '1H', 0, null, undefined]) {
      expect(isExpiryOption(bad)).toBe(false);
    }
  });

  it('computes from the supplied clock, not the caller clock', () => {
    const other = new Date('2020-01-01T00:00:00.000Z');
    expect(toExpiresAt('1h', other)?.toISOString()).toBe('2020-01-01T01:00:00.000Z');
  });
});
