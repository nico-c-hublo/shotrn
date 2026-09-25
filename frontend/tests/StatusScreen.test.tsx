import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  fetchMock.mockReset();
});

const link = {
  code: 'k9Xz2QmB7rT',
  shortUrl: 'http://localhost:3000/k9Xz2QmB7rT',
  previewUrl: 'http://localhost:3000/p/k9Xz2QmB7rT',
  originalUrl: 'https://example.com/gone',
  createdAt: '2026-09-24T12:00:00.000Z',
  expiresAt: '2026-09-24T13:00:00.000Z',
  status: 'expired',
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

  it('shows the expired screen for a code whose link has expired', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 410, json: async () => link });

    render(<App pathname="/k9Xz2QmB7rT" />);

    expect(
      await screen.findByRole('heading', { name: 'This link has expired' }),
    ).toBeInTheDocument();
    // The destination is deliberately not shown here: the visitor did not ask to preview it.
    expect(screen.queryByText('https://example.com/gone')).not.toBeInTheDocument();
  });

  it('falls back to "Link not found" when the API itself fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    render(<App pathname="/zzzzzzzzzzz" />);

    expect(await screen.findByRole('heading', { name: 'Link not found' })).toBeInTheDocument();
  });

  it('shows the destination on the preview route for an expired link', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 410, json: async () => link });

    render(<App pathname="/p/k9Xz2QmB7rT" />);

    await waitFor(() => expect(screen.getByText('https://example.com/gone')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Continue to this site' })).not.toBeInTheDocument();
  });
});
