import Sqids from 'sqids';

/** Reserved first path segments that a generated code must never shadow. */
export const RESERVED_SEGMENTS = ['assets', 'preview'];

export const MIN_CODE_LENGTH = 6;
export const MAX_CODE_LENGTH = 10;

export interface ShortCodec {
  /** Encode a link id into its canonical short code. */
  encode(id: number): string;
  /** Decode a short code back to its link id, or null when the code cannot be one we issued. */
  decode(code: string): number | null;
}

export function createShortCodec(alphabet: string): ShortCodec {
  const sqids = new Sqids({
    alphabet,
    minLength: MIN_CODE_LENGTH,
    blocklist: new Set(RESERVED_SEGMENTS),
  });

  return {
    encode(id: number): string {
      if (!Number.isSafeInteger(id) || id < 1) {
        throw new RangeError('link id must be a positive safe integer');
      }
      return sqids.encode([id]);
    },

    decode(code: string): number | null {
      if (code.length < MIN_CODE_LENGTH || code.length > MAX_CODE_LENGTH) return null;
      const numbers = sqids.decode(code);
      if (numbers.length !== 1) return null;
      const [id] = numbers;
      if (!Number.isSafeInteger(id) || id < 1) return null;
      // Sqids happily decodes strings we never issued. Only the canonical encoding counts,
      // so `/aaaaaa` cannot resolve to a real link.
      if (sqids.encode([id]) !== code) return null;
      return id;
    },
  };
}
