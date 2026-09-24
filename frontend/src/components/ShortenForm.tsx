import { useState, type FormEvent } from 'react';
import {
  createLink,
  EXPIRY_OPTIONS,
  MAX_URL_LENGTH,
  type ExpiryOption,
  type LinkResponse,
} from '../api/links';

const EXPIRY_LABELS: Record<ExpiryOption, string> = {
  never: 'Never expires',
  '1h': 'Expires in 1 hour',
  '1d': 'Expires in 1 day',
  '7d': 'Expires in 7 days',
  '30d': 'Expires in 30 days',
};

interface Props {
  onCreated: (link: LinkResponse) => void;
}

export function ShortenForm({ onCreated }: Props) {
  const [url, setUrl] = useState('');
  const [expiry, setExpiry] = useState<ExpiryOption>('never');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();

    // Client-side checks mirror the server's, so obvious mistakes cost no round-trip.
    // The server re-validates regardless: this is convenience, not a trust boundary.
    const trimmed = url.trim();
    if (trimmed === '') {
      setError('Enter a link to shorten.');
      return;
    }
    if (trimmed.length > MAX_URL_LENGTH) {
      setError(`Links must be at most ${MAX_URL_LENGTH} characters.`);
      return;
    }

    setPending(true);
    setError(null);
    try {
      onCreated(await createLink(trimmed, expiry));
      setUrl('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label htmlFor="url">Long link</label>
      <input
        id="url"
        name="url"
        type="text"
        placeholder="https://example.com/a/very/long/link"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        aria-invalid={error !== null}
        aria-describedby={error ? 'url-error' : undefined}
      />

      <label htmlFor="expiry">Expiry</label>
      <select
        id="expiry"
        name="expiry"
        value={expiry}
        onChange={(e) => setExpiry(e.target.value as ExpiryOption)}
      >
        {EXPIRY_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {EXPIRY_LABELS[option]}
          </option>
        ))}
      </select>

      <button type="submit" disabled={pending}>
        {pending ? 'Shortening…' : 'Shorten'}
      </button>

      {error !== null && (
        <p id="url-error" role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}
