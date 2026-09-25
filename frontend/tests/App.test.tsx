import { describe, expect, it } from 'vitest';
import { parseRoute } from '../src/App';

describe('parseRoute', () => {
  it('routes the root to the shorten form', () => {
    expect(parseRoute('/')).toEqual({ kind: 'home' });
  });

  it('routes /p/:code to the preview', () => {
    expect(parseRoute('/p/k9Xz2QmB7rT')).toEqual({ kind: 'preview', code: 'k9Xz2QmB7rT' });
  });

  it('routes a bare code to the status screen', () => {
    expect(parseRoute('/k9Xz2QmB7rT')).toEqual({ kind: 'status', code: 'k9Xz2QmB7rT' });
  });

  it('falls back to home for anything that cannot be a code', () => {
    expect(parseRoute('/too-short')).toEqual({ kind: 'home' });
    // Six characters was a valid length under the former scheme; it no longer is.
    expect(parseRoute('/k9Xz2Q')).toEqual({ kind: 'home' });
    expect(parseRoute('/waaaaaytoolongforacode')).toEqual({ kind: 'home' });
    expect(parseRoute('/a/b/c')).toEqual({ kind: 'home' });
  });
});
