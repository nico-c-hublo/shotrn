/**
 * Load check for SC-002 (redirect p99 < 300 ms) and SC-003 (1,000 redirects/s,
 * 50 creates/s, zero failures).
 *
 * Run against a server started with RATE_LIMIT_REDIRECT_PER_MINUTE raised, so the
 * component under test is the service and not the throttler. Production limits stay as
 * they are: raising them to satisfy a load test would make enumeration ~10x cheaper and
 * weaken the FR-007 mitigation (research.md §6).
 *
 *   npm run load -w backend
 */
const BASE = process.env.LOAD_BASE_URL ?? 'http://localhost:3000';
const REDIRECT_TARGET = Number(process.env.LOAD_REDIRECTS ?? 2000);
const CREATE_TARGET = Number(process.env.LOAD_CREATES ?? 200);
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY ?? 50);

interface Outcome {
  ok: number;
  failed: number;
  latencies: number[];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function run(total: number, task: () => Promise<boolean>): Promise<Outcome> {
  const outcome: Outcome = { ok: 0, failed: 0, latencies: [] };
  let issued = 0;

  async function worker(): Promise<void> {
    while (issued < total) {
      issued++;
      const started = performance.now();
      const ok = await task().catch(() => false);
      outcome.latencies.push(performance.now() - started);
      if (ok) outcome.ok++;
      else outcome.failed++;
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return outcome;
}

async function main(): Promise<void> {
  const created = await fetch(`${BASE}/api/links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/load-target' }),
  });
  if (!created.ok) throw new Error(`seed failed: ${created.status}`);
  const { code } = (await created.json()) as { code: string };

  const redirectStart = performance.now();
  const redirects = await run(REDIRECT_TARGET, async () => {
    const res = await fetch(`${BASE}/${code}`, { redirect: 'manual' });
    return res.status === 301;
  });
  const redirectSeconds = (performance.now() - redirectStart) / 1000;

  const createStart = performance.now();
  const creates = await run(CREATE_TARGET, async () => {
    const res = await fetch(`${BASE}/api/links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: `https://example.com/load/${Math.random()}` }),
    });
    return res.status === 201;
  });
  const createSeconds = (performance.now() - createStart) / 1000;

  const sorted = [...redirects.latencies].sort((a, b) => a - b);
  const report = {
    redirects: {
      ok: redirects.ok,
      failed: redirects.failed,
      perSecond: Math.round(redirects.ok / redirectSeconds),
      p50Ms: Math.round(percentile(sorted, 50)),
      p99Ms: Math.round(percentile(sorted, 99)),
    },
    creates: {
      ok: creates.ok,
      failed: creates.failed,
      perSecond: Math.round(creates.ok / createSeconds),
    },
  };

  console.warn(JSON.stringify(report, null, 2));

  const failures: string[] = [];
  if (redirects.failed > 0) failures.push(`SC-003: ${redirects.failed} redirects failed`);
  if (creates.failed > 0) failures.push(`SC-003: ${creates.failed} creates failed`);
  if (report.redirects.perSecond < 1000) {
    failures.push(`SC-003: ${report.redirects.perSecond} redirects/s is below 1000`);
  }
  if (report.creates.perSecond < 50) {
    failures.push(`SC-003: ${report.creates.perSecond} creates/s is below 50`);
  }
  if (report.redirects.p99Ms >= 300) {
    failures.push(`SC-002: redirect p99 ${report.redirects.p99Ms}ms is not under 300ms`);
  }

  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
  }
  console.warn('SC-002 and SC-003 met.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
