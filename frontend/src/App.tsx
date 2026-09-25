import { useEffect, useState } from 'react';
import { getLink, type LinkResponse, type PreviewResult } from './api/links';
import { PreviewCard } from './components/PreviewCard';
import { ResultCard } from './components/ResultCard';
import { ShortenForm } from './components/ShortenForm';
import { StatusScreen } from './components/StatusScreen';
import { ThemeToggle } from './components/ThemeToggle';

/**
 * Two screens plus a status screen, selected from the path. A router dependency would buy
 * nothing here (research.md §9).
 */
export type Route =
  | { kind: 'home' }
  | { kind: 'preview'; code: string }
  | { kind: 'status'; code: string };

export function parseRoute(pathname: string): Route {
  const preview = /^\/p\/([0-9A-Za-z]{13})\/?$/.exec(pathname)?.[1];
  if (preview) return { kind: 'preview', code: preview };

  const code = /^\/([0-9A-Za-z]{13})\/?$/.exec(pathname)?.[1];
  // Reached only when the server served the shell with 404/410; an active link redirects
  // before the SPA ever loads.
  if (code) return { kind: 'status', code };

  return { kind: 'home' };
}

function Home() {
  const [link, setLink] = useState<LinkResponse | null>(null);

  return (
    <>
      <ShortenForm onCreated={setLink} />
      {link !== null && <ResultCard link={link} />}
    </>
  );
}

function CodeScreen({ code, preview }: { code: string; preview: boolean }) {
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    getLink(code)
      .then((r) => active && setResult(r))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [code]);

  if (failed) return <StatusScreen kind="not-found" />;
  if (result === null) return <p aria-live="polite">Loading…</p>;
  if (result.state === 'not-found') return <StatusScreen kind="not-found" />;
  if (result.state === 'expired') {
    return <StatusScreen kind="expired" expiresAt={result.link.expiresAt} />;
  }

  // A direct visit to an active link redirects before the SPA loads, so only the preview
  // route has one to show.
  if (!preview) return <StatusScreen kind="not-found" />;
  return <PreviewCard link={result.link} />;
}

export function App({ pathname = window.location.pathname }: { pathname?: string }) {
  const route = parseRoute(pathname);

  return (
    <main>
      <header>
        <h1>
          <a href="/">Shotrn</a>
        </h1>
        <ThemeToggle />
      </header>
      {route.kind === 'home' && <Home />}
      {route.kind === 'preview' && <CodeScreen code={route.code} preview />}
      {route.kind === 'status' && <CodeScreen code={route.code} preview={false} />}
    </main>
  );
}
