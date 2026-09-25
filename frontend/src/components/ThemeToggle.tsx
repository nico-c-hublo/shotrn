import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { DEVICE_DARK, pickTheme, storedTheme, type Theme } from '../theme';

export function ThemeToggle() {
  const [picked, setPicked] = useState<Theme | null>(storedTheme);
  const [deviceDark, setDeviceDark] = useState(() => window.matchMedia(DEVICE_DARK).matches);

  // Until the visitor picks, the page follows the device live, so the highlight must too.
  useEffect(() => {
    const query = window.matchMedia(DEVICE_DARK);
    const onChange = (event: { matches: boolean }) => setDeviceDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const active: Theme = picked ?? (deviceDark ? 'dark' : 'light');

  function pick(theme: Theme): void {
    // Flushed so the highlight moves inside the snapshot, not after the fade.
    const apply = () =>
      flushSync(() => {
        pickTheme(theme);
        setPicked(theme);
      });

    // A view transition cross-fades the whole page, native controls included, which a
    // CSS transition cannot reach (research.md §13). Older browsers switch instantly.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if ('startViewTransition' in document && !reduceMotion) document.startViewTransition(apply);
    else apply();
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Colour scheme">
      <button
        type="button"
        aria-label="Light mode"
        aria-pressed={active === 'light'}
        onClick={() => pick('light')}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      </button>
      <span aria-hidden="true">/</span>
      <button
        type="button"
        aria-label="Dark mode"
        aria-pressed={active === 'dark'}
        onClick={() => pick('dark')}
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </button>
    </div>
  );
}
