import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The documented setup is "copy .env.example to .env, then npm run db:migrate". That path
 * was broken once because nothing loaded .env while every check exported the variables by
 * hand. This exercises the real script with those variables absent from the environment.
 */
describe('documented .env flow', () => {
  const repoRoot = join(__dirname, '..', '..', '..');

  it('.env.example lists every variable the app requires', () => {
    const example = join(repoRoot, '.env.example');
    expect(existsSync(example)).toBe(true);

    const contents = readFileSync(example, 'utf8');
    for (const name of [
      'DATABASE_URL',
      'BASE_URL',
      'PORT',
      'RATE_LIMIT_CREATE_PER_HOUR',
      'RATE_LIMIT_REDIRECT_PER_MINUTE',
    ]) {
      expect(contents).toContain(`${name}=`);
    }
  });

  it('the migration runner reads DATABASE_URL from a .env file', () => {
    const url = process.env.DATABASE_URL;
    expect(url).toBeDefined();

    const dir = mkdtempSync(join(tmpdir(), 'shotrn-flow-'));
    const envPath = join(dir, '.env');
    writeFileSync(envPath, `DATABASE_URL=${url}\n`);

    const script = join(__dirname, '..', '..', 'src', 'db', 'migrate.ts');
    const env = { ...process.env };
    delete env.DATABASE_URL;

    // Throws on a non-zero exit, which is exactly how the original bug presented
    // ("DATABASE_URL is required"). Output goes to stderr, so merge the streams.
    const output = execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '-e',
        `process.loadEnvFile(${JSON.stringify(envPath)});require(${JSON.stringify(script)});`,
      ],
      { env, encoding: 'utf8', cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] },
    );

    expect(String(output)).toBeDefined();
  });
});
