import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { ThemeToggle } from '../src/components/ThemeToggle';
import { applyStoredTheme } from '../src/theme';

// jsdom implements no media queries, so the device's scheme is a stub whose change
// listeners the tests can fire.
let deviceDark = false;
let reducedMotion = false;
const listeners = new Set<(event: { matches: boolean }) => void>();

function setDeviceDark(dark: boolean): void {
  deviceDark = dark;
  act(() => listeners.forEach((listener) => listener({ matches: dark })));
}

const pressed = (name: string) =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed') === 'true';

const html = document.documentElement;

describe('ThemeToggle', () => {
  beforeEach(() => {
    deviceDark = false;
    reducedMotion = false;
    listeners.clear();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches:
        (deviceDark && query === '(prefers-color-scheme: dark)') ||
        (reducedMotion && query === '(prefers-reduced-motion: reduce)'),
      addEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
        listeners.add(listener),
      removeEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
        listeners.delete(listener),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    delete html.dataset.theme;
    // Only some tests give jsdom the View Transitions API.
    Reflect.deleteProperty(document, 'startViewTransition');
  });

  it('marks the device scheme active until the visitor picks one', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('group', { name: 'Colour scheme' })).toBeInTheDocument();
    expect(pressed('Light mode')).toBe(true);
    expect(pressed('Dark mode')).toBe(false);
    expect(html.dataset.theme).toBeUndefined();
  });

  it('marks dark active on a dark device', () => {
    deviceDark = true;
    render(<ThemeToggle />);
    expect(pressed('Dark mode')).toBe(true);
    expect(pressed('Light mode')).toBe(false);
  });

  it('applies and stores a pick at once', async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button', { name: 'Dark mode' }));

    expect(html.dataset.theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(pressed('Dark mode')).toBe(true);
    expect(pressed('Light mode')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Light mode' }));
    expect(html.dataset.theme).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
    expect(pressed('Light mode')).toBe(true);
  });

  it('lets a stored pick win over the device after a reload', () => {
    localStorage.setItem('theme', 'dark');
    applyStoredTheme();
    render(<ThemeToggle />);

    expect(html.dataset.theme).toBe('dark');
    expect(pressed('Dark mode')).toBe(true);
  });

  it('ignores a stored value that is not a scheme', () => {
    localStorage.setItem('theme', 'sepia');
    applyStoredTheme();
    render(<ThemeToggle />);

    expect(html.dataset.theme).toBeUndefined();
    expect(pressed('Light mode')).toBe(true);
  });

  it('follows a device change only while nothing is picked', async () => {
    render(<ThemeToggle />);
    setDeviceDark(true);
    expect(pressed('Dark mode')).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Light mode' }));
    setDeviceDark(false);
    setDeviceDark(true);
    expect(pressed('Light mode')).toBe(true);
  });

  it('still switches the page when the browser refuses storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    applyStoredTheme();
    render(<ThemeToggle />);
    expect(pressed('Light mode')).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Dark mode' }));
    expect(html.dataset.theme).toBe('dark');
    expect(pressed('Dark mode')).toBe(true);
  });

  describe('with the View Transitions API', () => {
    // Records what the page looked like when the new snapshot would be taken.
    let seen: { theme?: string; darkPressed: boolean }[];

    beforeEach(() => {
      seen = [];
      Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        value: vi.fn((update: () => void) => {
          update();
          seen.push({ theme: html.dataset.theme, darkPressed: pressed('Dark mode') });
        }),
      });
    });

    it('cross-fades a pick, highlight included', async () => {
      render(<ThemeToggle />);
      await userEvent.click(screen.getByRole('button', { name: 'Dark mode' }));

      expect(seen).toEqual([{ theme: 'dark', darkPressed: true }]);
    });

    it('switches without a fade when reduced motion is asked for', async () => {
      reducedMotion = true;
      render(<ThemeToggle />);
      await userEvent.click(screen.getByRole('button', { name: 'Dark mode' }));

      expect(seen).toEqual([]);
      expect(html.dataset.theme).toBe('dark');
      expect(pressed('Dark mode')).toBe(true);
    });
  });
});
