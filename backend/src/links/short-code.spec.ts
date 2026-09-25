import { CODE_CHARS, CODE_LENGTH, generateCode, isWellFormedCode } from './short-code';

describe('short code', () => {
  it('generates codes of the required shape (FR-006)', () => {
    for (let i = 0; i < 1000; i++) expect(generateCode()).toMatch(/^[0-9A-Za-z]{13}$/);
  });

  // FR-007: each position is an independent draw over the whole alphabet. A stub source
  // makes this deterministic: stepping it through 0..61 must yield every character in
  // every position, so no position is fixed or restricted.
  it('can produce every character at every position', () => {
    for (let offset = 0; offset < CODE_CHARS.length; offset++) {
      let calls = 0;
      const code = generateCode((max) => {
        expect(max).toBe(CODE_CHARS.length);
        return (offset + calls++) % max;
      });
      expect(calls).toBe(CODE_LENGTH);
      for (let position = 0; position < CODE_LENGTH; position++) {
        expect(code[position]).toBe(CODE_CHARS[(offset + position) % CODE_CHARS.length]);
      }
    }
  });

  // Not a statistical test, only a tripwire: a broken source (constant, or reseeded per
  // call) repeats immediately, while 10,000 real draws collide with probability ~1e-12.
  it('does not repeat itself across draws', () => {
    const codes = new Set(Array.from({ length: 10_000 }, () => generateCode()));
    expect(codes.size).toBe(10_000);
  });

  it.each([
    '',
    'short',
    'k9Xz2QmB7rTq',
    'k9Xz2QmB7rTq4x',
    'k9Xz2QmB7rTq!',
    'k9Xz2QmB7rTq-',
    'k9Xz2QmB7rTqé',
  ])('rejects %j as malformed', (code) => {
    expect(isWellFormedCode(code)).toBe(false);
  });

  it('accepts a code it could have issued', () => {
    expect(isWellFormedCode('k9Xz2QmB7rTq4')).toBe(true);
  });

  // `/:code` is a catch-all, so a code equal to a reserved first segment would be
  // unreachable. Fixed-length codes rule that out, provided no segment is that long.
  it.each(['api', 'p', 'assets'])('can never collide with the reserved segment /%s', (segment) => {
    expect(segment).not.toHaveLength(CODE_LENGTH);
  });
});
