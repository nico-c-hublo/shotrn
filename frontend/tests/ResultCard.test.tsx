import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vite-plus/test';
import { ResultCard } from '../src/components/ResultCard';
import type { LinkResponse } from '../src/api/links';

const permanent: LinkResponse = {
  code: 'k9Xz2QmB7rTq4',
  shortUrl: 'http://localhost:3000/k9Xz2QmB7rTq4',
  previewUrl: 'http://localhost:3000/p/k9Xz2QmB7rTq4',
  originalUrl: 'https://example.com/very/long',
  createdAt: '2026-09-24T12:00:00.000Z',
  expiresAt: null,
  status: 'active',
};

describe('ResultCard', () => {
  // FR-010. userEvent.setup() installs a real clipboard stub, so this asserts the
  // clipboard's actual contents rather than that a mock was called.
  it('shows the full short url and copies it in one action', async () => {
    const user = userEvent.setup();

    render(<ResultCard link={permanent} />);
    expect(screen.getByText('http://localhost:3000/k9Xz2QmB7rTq4')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(await navigator.clipboard.readText()).toBe('http://localhost:3000/k9Xz2QmB7rTq4');
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });

  it('says so when a link never expires', () => {
    render(<ResultCard link={permanent} />);
    expect(screen.getByText('This link never expires.')).toBeInTheDocument();
  });

  // FR-012
  it('renders an absolute expiry date and time for a temporary link', () => {
    render(<ResultCard link={{ ...permanent, expiresAt: '2026-09-25T12:00:00.000Z' }} />);

    const expected = new Date('2026-09-25T12:00:00.000Z').toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    expect(screen.getByText(`Expires ${expected}`)).toBeInTheDocument();
  });

  it('links to the preview so the destination can be checked first', () => {
    render(<ResultCard link={permanent} />);
    expect(screen.getByRole('link', { name: permanent.previewUrl })).toHaveAttribute(
      'href',
      permanent.previewUrl,
    );
  });
});
