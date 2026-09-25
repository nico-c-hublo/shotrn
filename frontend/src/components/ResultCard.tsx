import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
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
    <section className="card result" aria-label="Your short link">
      <p className="short-url">{link.shortUrl}</p>

      {/* Fixed colours ignore dark mode: many scanners cannot read an inverted code, and
          the white margin is the quiet zone the standard requires (research.md §12). */}
      <QRCodeSVG
        className="qr"
        value={link.shortUrl}
        title={`QR code for ${link.shortUrl}`}
        level="M"
        marginSize={4}
        bgColor="#FFFFFF"
        fgColor="#000000"
      />

      <div className="result-details">
        {/* copy() handles its own failure; `void` marks the promise as deliberately unawaited. */}
        <button type="button" onClick={() => void copy()}>
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
      </div>
    </section>
  );
}
