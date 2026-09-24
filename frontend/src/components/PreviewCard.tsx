import type { LinkResponse } from '../api/links';
import { formatAbsolute } from '../format';

interface Props {
  link: LinkResponse;
  expired: boolean;
}

/**
 * Shows where a short link leads without following it (FR-016). The visitor must click
 * through deliberately — nothing here navigates on its own.
 */
export function PreviewCard({ link, expired }: Props) {
  return (
    <section className="card" aria-label="Link preview">
      <h2>{expired ? 'This link has expired' : 'This link goes to'}</h2>

      <p className="destination">{link.originalUrl}</p>

      <dl>
        <dt>Created</dt>
        <dd>{formatAbsolute(link.createdAt)}</dd>
        {link.expiresAt !== null && (
          <>
            <dt>{expired ? 'Expired' : 'Expires'}</dt>
            <dd>{formatAbsolute(link.expiresAt)}</dd>
          </>
        )}
      </dl>

      {expired ? (
        <p>The link is no longer active, so it will not take you anywhere.</p>
      ) : (
        <a className="continue" href={link.originalUrl} rel="noopener noreferrer nofollow">
          Continue to this site
        </a>
      )}
    </section>
  );
}
