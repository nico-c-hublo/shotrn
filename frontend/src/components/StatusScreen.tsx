import { formatAbsolute } from '../format';

type Props = { kind: 'not-found' } | { kind: 'expired'; expiresAt: string };

/** Shared copy for a link that cannot be followed, used by both the SPA and direct visits. */
export function StatusScreen(props: Props) {
  const expired = props.kind === 'expired';

  return (
    <section className="card" aria-label={expired ? 'Link expired' : 'Link not found'}>
      <h2>{expired ? 'This link has expired' : 'Link not found'}</h2>
      <p>
        {expired
          ? `The person who created this link set it to expire on ${formatAbsolute(props.expiresAt)}, and that time has passed.`
          : 'We have no record of this short link. Check the address for typos — short links are case-sensitive.'}
      </p>
      <a href="/">Shorten a new link</a>
    </section>
  );
}
