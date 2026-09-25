import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { PreviewCard } from '../src/components/PreviewCard';
import type { LinkResponse } from '../src/api/links';

const link: LinkResponse = {
  code: 'k9Xz2QmB7rTq4',
  shortUrl: 'http://localhost:3000/k9Xz2QmB7rTq4',
  previewUrl: 'http://localhost:3000/p/k9Xz2QmB7rTq4',
  originalUrl: 'https://example.com/destination?x=1',
  createdAt: '2026-09-24T12:00:00.000Z',
  expiresAt: '2026-10-01T12:00:00.000Z',
  status: 'active',
};

describe('PreviewCard', () => {
  // FR-016
  it('shows the destination as text and never navigates on its own', () => {
    render(<PreviewCard link={link} />);

    expect(screen.getByText('https://example.com/destination?x=1')).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: 'Continue to this site' });
    expect(cta).toHaveAttribute('href', link.originalUrl);
    expect(cta).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('shows creation and expiry dates', () => {
    render(<PreviewCard link={link} />);
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Expires')).toBeInTheDocument();
  });

  it('omits expiry for a permanent link', () => {
    render(<PreviewCard link={{ ...link, expiresAt: null }} />);
    expect(screen.queryByText('Expires')).not.toBeInTheDocument();
  });
});
