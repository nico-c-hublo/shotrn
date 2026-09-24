interface Props {
  kind: 'not-found' | 'expired';
}

/** Shared copy for a link that cannot be followed, used by both the SPA and direct visits. */
export function StatusScreen({ kind }: Props) {
  return (
    <section className="card" aria-label={kind === 'expired' ? 'Link expired' : 'Link not found'}>
      <h2>{kind === 'expired' ? 'This link has expired' : 'Link not found'}</h2>
      <p>
        {kind === 'expired'
          ? 'The person who created this link set it to expire, and that time has passed.'
          : 'We have no record of this short link. Check the address for typos — short links are case-sensitive.'}
      </p>
      <a href="/">Shorten a new link</a>
    </section>
  );
}
