import '@testing-library/jest-dom/vitest';

// jsdom implements no media queries. Every page renders the colour scheme toggle, which
// reads one, so default to a device that matches nothing; tests that care stub their own.
window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }) as unknown as MediaQueryList;
