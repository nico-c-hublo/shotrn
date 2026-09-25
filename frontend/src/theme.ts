/**
 * The visitor's colour scheme pick (FR-023, research.md §13). Without one, the page
 * follows the device through `color-scheme: light dark`.
 */
export type Theme = 'light' | 'dark';

export const DEVICE_DARK = '(prefers-color-scheme: dark)';

const KEY = 'theme';

// Storage throws when the browser blocks site data. The pick then lasts until the page
// is left, and the next visit follows the device again.
export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function pickTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Already applied to this page; nothing else to do without storage.
  }
}

/** Runs before the first render, the earliest point the CSP allows a script. */
export function applyStoredTheme(): void {
  const theme = storedTheme();
  if (theme !== null) document.documentElement.dataset.theme = theme;
}
