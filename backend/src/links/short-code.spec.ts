import { CODE_CHARS } from '../config/env';
import { createShortCodec, MAX_CODE_LENGTH, MIN_CODE_LENGTH } from './short-code';

// Derived from CODE_CHARS so it cannot drift out of sync with the validator. A hand-typed
// literal silently did: it was 61 characters, and the fallback hid the mistake.
const ALPHABET = [...CODE_CHARS].reverse().join('');
const codec = createShortCodec(ALPHABET);

describe('short code', () => {
  it('produces codes of the required shape (FR-006)', () => {
    const pattern = new RegExp(`^[0-9A-Za-z]{${MIN_CODE_LENGTH},${MAX_CODE_LENGTH}}$`);
    for (let id = 1; id <= 1000; id++) expect(codec.encode(id)).toMatch(pattern);
    for (const id of [1_000_000, 50_000_000, 999_999_999]) {
      expect(codec.encode(id)).toMatch(pattern);
    }
  });

  it('round-trips every id it encodes', () => {
    for (let id = 1; id <= 2000; id++) expect(codec.decode(codec.encode(id))).toBe(id);
  });

  // FR-007: knowing one code must not reveal the next by simple increment.
  it('does not produce sequential-looking codes for adjacent ids', () => {
    let differsOnlyInLastChar = 0;
    for (let id = 1; id <= 1000; id++) {
      const a = codec.encode(id);
      const b = codec.encode(id + 1);
      if (a.length === b.length && a.slice(0, -1) === b.slice(0, -1)) differsOnlyInLastChar++;
    }
    expect(differsOnlyInLastChar).toBe(0);
  });

  it('rejects codes it did not issue', () => {
    expect(codec.decode('!!!!!!')).toBeNull();
    expect(codec.decode('short')).toBeNull();
    expect(codec.decode('waaaaaaaaaaytoolong')).toBeNull();
    expect(codec.decode('')).toBeNull();
  });

  it('rejects a non-canonical encoding of a real id', () => {
    const real = codec.encode(42);
    // Same characters, different order: decodes to something, but is not the canonical form.
    const scrambled = real.slice(1) + real[0];
    if (scrambled !== real) expect(codec.decode(scrambled)).not.toBe(42);
  });

  it('is case-sensitive', () => {
    const code = codec.encode(12345);
    const flipped = [...code]
      .map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()))
      .join('');
    if (flipped !== code) expect(codec.decode(flipped)).not.toBe(12345);
  });

  it('refuses to encode ids outside the safe range', () => {
    expect(() => codec.encode(0)).toThrow(RangeError);
    expect(() => codec.encode(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
  });
});
