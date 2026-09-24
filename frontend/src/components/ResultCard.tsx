import { useState } from 'react';
import type { LinkResponse } from '../api/links';
import { formatAbsolute } from '../format';

interface Props {
  link: LinkResponse;
}

export function ResultCard({ link }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(link.shortUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="card" aria-label="Your short link">
      <p className="short-url">{link.shortUrl}</p>

      <button type="button" onClick={copy}>
        {copied ? 'Copied!' : 'Copy'}
      </button>

      <p className="expiry">
        {link.expiresAt === null
          ? 'This link never expires.'
          : `Expires ${formatAbsolute(link.expiresAt)}`}
      </p>

      <p className="preview-hint">
        Check where it goes first: <a href={link.previewUrl}>{link.previewUrl}</a>
      </p>
    </section>
  );
}
