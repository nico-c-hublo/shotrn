/**
 * Why the server could not redirect, as stated in the page it served with a 404 or 410.
 * Reading it spares the status screen a second lookup, which the unknown-code limit would
 * charge again (research.md §6). Mirrors `ServedOutcome` in `backend/src/links/spa.ts`,
 * and matches `StatusScreen`'s props.
 */
export type ServedOutcome = { kind: 'not-found' } | { kind: 'expired'; expiresAt: string };

function meta(doc: Document, name: string): string | undefined {
  return doc.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content;
}

/** Null when the page states no outcome, e.g. it was served some other way. */
export function readServedOutcome(doc: Document = document): ServedOutcome | null {
  const status = meta(doc, 'shotrn-link-status');
  if (status === 'not-found') return { kind: 'not-found' };

  const expiresAt = meta(doc, 'shotrn-link-expires-at');
  if (status === 'expired' && expiresAt) return { kind: 'expired', expiresAt };

  return null;
}
