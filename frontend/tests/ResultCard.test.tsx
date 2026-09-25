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

  // FR-021
  it('shows a QR code named after the short url it encodes', () => {
    render(<ResultCard link={permanent} />);
    expect(
      screen.getByRole('img', { name: `QR code for ${permanent.shortUrl}` }),
    ).toBeInTheDocument();
  });

  // FR-021: without four blank modules around it, scanners cannot find the code's edges.
  it('keeps a four-module quiet zone around the QR code', () => {
    render(<ResultCard link={permanent} />);
    const svg = screen.getByRole('img', { name: /^QR code/ });
    const size = Number(svg.getAttribute('viewBox')?.split(' ')[2]);
    const modules = svg.querySelector('path[fill="#000000"]')?.getAttribute('d') ?? '';

    // Each dark run starts `M<x> <y>h<length>`; runs reaching the right edge use
    // `M<x>,<y> h<length>`, and those are the ones that would breach the quiet zone.
    const runs = [...modules.matchAll(/M(\d+)[ ,](\d+) ?h(\d+)/g)].map(([, x, y, length]) => ({
      x: Number(x),
      y: Number(y),
      end: Number(x) + Number(length),
    }));

    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      expect(run.x).toBeGreaterThanOrEqual(4);
      expect(run.y).toBeGreaterThanOrEqual(4);
      expect(run.end).toBeLessThanOrEqual(size - 4);
      expect(run.y).toBeLessThan(size - 4);
    }
  });

  // FR-021: many scanners cannot read a light-on-dark code, so dark mode must not invert it.
  it('draws the QR code black on white', () => {
    render(<ResultCard link={permanent} />);
    const svg = screen.getByRole('img', { name: /^QR code/ });
    const [background, foreground] = svg.querySelectorAll('path');

    expect(background).toHaveAttribute('fill', '#FFFFFF');
    expect(foreground).toHaveAttribute('fill', '#000000');
  });

  it('links to the preview so the destination can be checked first', () => {
    render(<ResultCard link={permanent} />);
    expect(screen.getByRole('link', { name: permanent.previewUrl })).toHaveAttribute(
      'href',
      permanent.previewUrl,
    );
  });
});
