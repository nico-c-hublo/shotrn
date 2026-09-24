import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Asserted in a child process: `process.loadEnvFile` mutates the real environment, and
 * Jest's sandboxed `process.env` does not reflect that, so an in-process test would
 * silently pass while the behaviour was broken.
 */
function probe(fileContents: string | null, preset: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'shotrn-env-'));
  const path = join(dir, '.env');
  if (fileContents !== null) writeFileSync(path, fileContents);

  const script = `
    const { loadEnvFile } = require(${JSON.stringify(join(__dirname, 'load-env-file.ts'))});
    loadEnvFile(${JSON.stringify(path)});
    process.stdout.write(String(process.env.SHOTRN_PROBE));
  `;

  return execFileSync(process.execPath, ['--import', 'tsx', '-e', script], {
    env: { ...process.env, ...preset },
    encoding: 'utf8',
  });
}

describe('loadEnvFile', () => {
  it('loads values from the file into process.env', () => {
    expect(probe('SHOTRN_PROBE=from_file\n', {})).toBe('from_file');
  });

  // Production and CI supply real environment variables; a stray .env must never win.
  it('never overrides a variable that is already set', () => {
    expect(probe('SHOTRN_PROBE=from_file\n', { SHOTRN_PROBE: 'from_environment' })).toBe(
      'from_environment',
    );
  });

  it('is a no-op when the file does not exist', () => {
    expect(probe(null, { SHOTRN_PROBE: 'untouched' })).toBe('untouched');
  });
});
