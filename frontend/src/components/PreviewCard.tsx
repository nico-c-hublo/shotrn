import type { LinkResponse } from '../api/links';
import { formatAbsolute } from '../format';

interface Props {
  link: LinkResponse;
}

/**
 * Shows where an active short link leads without following it (FR-016). The visitor must
 * click through deliberately — nothing here navigates on its own. Expired links never
 * reach this card: their destination is withheld (FR-013).
 */
export function PreviewCard({ link }: Props) {
  return (
    <section className="card" aria-label="Link preview">
      <h2>This link goes to</h2>

      <p className="destination">{link.originalUrl}</p>

      <dl>
        <dt>Created</dt>
        <dd>{formatAbsolute(link.createdAt)}</dd>
        {link.expiresAt !== null && (
          <>
            <dt>Expires</dt>
            <dd>{formatAbsolute(link.expiresAt)}</dd>
          </>
        )}
      </dl>

      <a className="continue" href={link.originalUrl} rel="noopener noreferrer nofollow">
        Continue to this site
      </a>
    </section>
  );
}
