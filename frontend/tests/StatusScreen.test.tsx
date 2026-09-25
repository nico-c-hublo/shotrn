import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { formatAbsolute } from '../src/format';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  fetchMock.mockReset();
  document.head.querySelectorAll('meta[name^="shotrn-link-"]').forEach((meta) => meta.remove());
});

/** What the redirect path adds to the page it serves for a 404 or 410. */
function serveOutcome(tags: Record<string, string>) {
  for (const [name, content] of Object.entries(tags)) {
    const meta = document.createElement('meta');
    meta.name = name;
    meta.content = content;
    document.head.append(meta);
  }
}

const EXPIRES_AT = '2026-09-24T13:00:00.000Z';

// A 410 body carries no destination (FR-013). This one adds `originalUrl` anyway, as a
// misbehaving server might, to prove the page would still not display it.
const expired = {
  code: 'k9Xz2QmB7rTq4',
  status: 'expired',
  expiresAt: EXPIRES_AT,
  originalUrl: 'https://example.com/gone',
};

/**
 * The redirect path serves the SPA shell with a 404 or 410 and states the outcome in the
 * page, so a direct visit costs one lookup, not two (research.md §6).
 */
describe('the outcome stated by the served page', () => {
  it('shows "Link not found" without looking the code up again', async () => {
    serveOutcome({ 'shotrn-link-status': 'not-found' });

    render(<App pathname="/zzzzzzzzzzzzz" />);

    expect(await screen.findByRole('heading', { name: 'Link not found' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows when an expired link expired without looking the code up again', async () => {
    serveOutcome({ 'shotrn-link-status': 'expired', 'shotrn-link-expires-at': EXPIRES_AT });

    render(<App pathname="/k9Xz2QmB7rTq4" />);

    expect(
      await screen.findByRole('heading', { name: 'This link has expired' }),
    ).toBeInTheDocument();
    expect(screen.getByText(formatAbsolute(EXPIRES_AT), { exact: false })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The preview route is served with 200 and no outcome; it must always ask the API.
  it('is ignored on the preview route', async () => {
    serveOutcome({ 'shotrn-link-status': 'not-found' });
    fetchMock.mockResolvedValue({ ok: false, status: 410, json: async () => expired });

    render(<App pathname="/p/k9Xz2QmB7rTq4" />);

    expect(
      await screen.findByRole('heading', { name: 'This link has expired' }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * Without a stated outcome (a page served some other way), the status screen falls back
 * to asking the API, so the visitor still lands on the right screen.
 */
describe('visiting a short link that cannot be followed', () => {
  it('shows "Link not found" for a code that was never issued', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });

    render(<App pathname="/zzzzzzzzzzzzz" />);

    expect(await screen.findByRole('heading', { name: 'Link not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Shorten a new link' })).toHaveAttribute('href', '/');
  });

  it.each(['/k9Xz2QmB7rTq4', '/p/k9Xz2QmB7rTq4'])(
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

    render(<App pathname="/zzzzzzzzzzzzz" />);

    expect(await screen.findByRole('heading', { name: 'Link not found' })).toBeInTheDocument();
  });
});
