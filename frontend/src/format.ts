/** Absolute expiry rendered in the visitor's own timezone (FR-012). */
export function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
