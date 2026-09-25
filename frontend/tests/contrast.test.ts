import { describe, expect, it } from 'vite-plus/test';
import css from '../src/styles.css?raw';

// FR-022. jsdom applies no stylesheet and resolves no light-dark(), so the colour tokens
// are read from the stylesheet and split into one palette per scheme by hand.

function rule(selector: RegExp): string {
  const body = selector.exec(css)?.[1];
  if (body === undefined) throw new Error(`no rule matches ${selector}`);
  return body;
}

function token(scheme: Record<string, string>, name: string): string {
  const value = scheme[name];
  if (value === undefined) throw new Error(`no ${name} token`);
  return value;
}

const root = rule(/^:root \{([^}]*)\}/m);
const light: Record<string, string> = {};
const dark: Record<string, string> = {};
for (const [, name, l, d] of root.matchAll(
  /(--[\w-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi,
)) {
  if (name === undefined || l === undefined || d === undefined) continue;
  light[name] = l;
  dark[name] = d;
}

/** WCAG 2.1 relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('colour contrast', () => {
  it('draws button labels in the on-accent colour over the accent', () => {
    // The standalone `button` rule, not the `input, select, button` group before it.
    const button = rule(/(?<!,\n)^button \{([^}]*)\}/m);
    expect(button).toMatch(/\bbackground: var\(--accent\)/);
    expect(button).toMatch(/\bcolor: var\(--on-accent\)/);
  });

  it.each([
    ['light', light],
    ['dark', dark],
  ])('keeps button labels, links and muted text at 4.5:1 or more in %s mode', (_, scheme) => {
    const accent = token(scheme, '--accent');
    const bg = token(scheme, '--bg');
    expect(contrast(token(scheme, '--on-accent'), accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(accent, bg)).toBeGreaterThanOrEqual(4.5);
    // Labels, hints, and the inactive icon of the colour scheme toggle (FR-023).
    expect(contrast(token(scheme, '--muted'), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('gives every colour token a value in both schemes', () => {
    const declared = [...root.matchAll(/(--[\w-]+):/g)].map(([, name]) => name);
    expect(Object.keys(light)).toEqual(declared);
  });
});
