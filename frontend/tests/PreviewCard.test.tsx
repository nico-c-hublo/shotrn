import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PreviewCard } from '../src/components/PreviewCard';
import type { LinkResponse } from '../src/api/links';

const link: LinkResponse = {
  code: 'k9Xz2QmB7rT',
  shortUrl: 'http://localhost:3000/k9Xz2QmB7rT',
  previewUrl: 'http://localhost:3000/p/k9Xz2QmB7rT',
  originalUrl: 'https://example.com/destination?x=1',
  createdAt: '2026-09-24T12:00:00.000Z',
  expiresAt: '2026-10-01T12:00:00.000Z',
  status: 'active',
};

describe('PreviewCard', () => {
  // FR-016
  it('shows the destination as text and never navigates on its own', () => {
    render(<PreviewCard link={link} expired={false} />);

    expect(screen.getByText('https://example.com/destination?x=1')).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: 'Continue to this site' });
    expect(cta).toHaveAttribute('href', link.originalUrl);
    expect(cta).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('shows creation and expiry dates', () => {
    render(<PreviewCard link={link} expired={false} />);
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Expires')).toBeInTheDocument();
  });

  it('omits expiry for a permanent link', () => {
    render(<PreviewCard link={{ ...link, expiresAt: null }} expired={false} />);
    expect(screen.queryByText('Expires')).not.toBeInTheDocument();
  });

  it('offers no way through once the link has expired', () => {
    render(<PreviewCard link={link} expired />);

    expect(screen.getByRole('heading', { name: 'This link has expired' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Continue to this site' })).not.toBeInTheDocument();
  });
});
