import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { formatAbsolute } from '../src/format';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  fetchMock.mockReset();
});

const EXPIRES_AT = '2026-09-24T13:00:00.000Z';

// A 410 body carries no destination (FR-013). This one adds `originalUrl` anyway, as a
// misbehaving server might, to prove the page would still not display it.
const expired = {
  code: 'k9Xz2QmB7rT',
  status: 'expired',
  expiresAt: EXPIRES_AT,
  originalUrl: 'https://example.com/gone',
};

/**
 * The server serves the SPA shell with a 404 or 410 for a code that cannot be followed.
 * The page itself cannot read that status, so it asks the API — these cover that the
 * visitor ends up on the right screen rather than a blank page.
 */
describe('visiting a short link that cannot be followed', () => {
  it('shows "Link not found" for a code that was never issued', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });

    render(<App pathname="/zzzzzzzzzzz" />);

    expect(await screen.findByRole('heading', { name: 'Link not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shorten a new link' })).toHaveAttribute('href', '/');
  });

  it.each(['/k9Xz2QmB7rT', '/p/k9Xz2QmB7rT'])(
    'on %s, says when the link expired but never where it pointed',
    async (pathname) => {
      fetchMock.mockResolvedValue({ ok: false, status: 410, json: async () => expired });

      render(<App pathname={pathname} />);

      expect(
        await screen.findByRole('heading', { name: 'This link has expired' }),
      ).toBeInTheDocument();
      expect(screen.getByText(formatAbsolute(EXPIRES_AT), { exact: false })).toBeInTheDocument();
      expect(screen.queryByText(/example\.com/)).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Continue to this site' })).not.toBeInTheDocument();
    },
  );

  it('falls back to "Link not found" when the API itself fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    render(<App pathname="/zzzzzzzzzzz" />);

    expect(await screen.findByRole('heading', { name: 'Link not found' })).toBeInTheDocument();
  });
});
