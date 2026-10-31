/**
 * QA acceptance — fresh-clone build order, docs accuracy, packaging metadata.
 * EXPECTED TO FAIL until BUG-08/09/14 are fixed. Set QA_SKIP_FRESH=1 to skip the slow fresh-clone tests.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const PKGS = ['shared', 'core', 'react', 'vue'];
const pkgJson = (p: string) => JSON.parse(readFileSync(join(ROOT, 'packages', p, 'package.json'), 'utf8'));
const env = { ...process.env, COREPACK_HOME: process.env.COREPACK_HOME ?? '/tmp/corepack', CI: '1' };
const sh = (cmd: string, cwd: string) => spawnSync('bash', ['-lc', cmd], { cwd, env, encoding: 'utf8', maxBuffer: 64 << 20 });

describe.skipIf(process.env.QA_SKIP_FRESH === '1')('fresh clone (no prior build)', () => {
  let dir = '';
  let installOk = false;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'rw-fresh-'));
    execSync(`git clone -q --no-hardlinks "${ROOT}" "${dir}/repo"`, { env });
    const r = sh('pnpm install --frozen-lockfile --prefer-offline --ignore-scripts', join(dir, 'repo'));
    installOk = r.status === 0;
    if (!installOk) console.error(r.stdout, r.stderr);
  }, 240_000);

  it('BUG-08 `pnpm typecheck` succeeds right after install (no manual build of shared first)', () => {
    expect(installOk, 'pnpm install failed').toBe(true);
    const r = sh('pnpm typecheck', join(dir, 'repo'));
    expect(r.status, (r.stdout + r.stderr).slice(-1500)).toBe(0);
  }, 240_000);

  it('BUG-08 `pnpm test:run` succeeds right after install', () => {
    expect(installOk, 'pnpm install failed').toBe(true);
    const r = sh('pnpm test:run', join(dir, 'repo'));
    expect(r.status, (r.stdout + r.stderr).slice(-1500)).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  }, 240_000);
});

describe('docs and test quality', () => {
  it('BUG-09 PROJECT_MAP "إجمالي الاختبارات" equals the real default test count', () => {
    const map = readFileSync(join(ROOT, 'PROJECT_MAP.md'), 'utf8');
    const m = map.match(/إجمالي الاختبارات:\s*(\d+)/);
    expect(m, 'total line missing in PROJECT_MAP.md').toBeTruthy();
    let total = 0;
    for (const p of PKGS) {
      const out = join(tmpdir(), `rw-qa-count-${p}.json`);
      sh(`npx vitest run --reporter=json --outputFile="${out}" >/dev/null 2>&1`, join(ROOT, 'packages', p));
      const j = JSON.parse(readFileSync(out, 'utf8'));
      total += j.numTotalTests as number;
    }
    expect(Number(m![1])).toBe(total);
  }, 180_000);

  it('BUG-09 default suite contains a PDF text-content assertion (not only "%PDF" magic bytes)', () => {
    const r = sh(`grep -rlE "getTextContent|pdfjs-dist|extractPdfText" --include=*.test.ts packages/*/src || true`, ROOT);
    expect(r.stdout.trim(), 'no default test inspects PDF text').not.toBe('');
  });
});

describe('packaging', () => {
  for (const p of PKGS) {
    it(`BUG-14 @reports-web/${p} declares license, repository and sideEffects`, () => {
      const j = pkgJson(p);
      expect({ license: !!j.license, repository: !!j.repository, sideEffects: j.sideEffects !== undefined }).toEqual({ license: true, repository: true, sideEffects: true });
    });
    it(`BUG-14 @reports-web/${p} every exports entry has "types" and "files" is set`, () => {
      const j = pkgJson(p);
      expect(j.files).toBeTruthy();
      for (const [k, v] of Object.entries(j.exports ?? {})) expect((v as { types?: string }).types, `exports["${k}"].types`).toBeTruthy();
    });
    it(`BUG-14 @reports-web/${p} packed tarball ships no .tsbuildinfo`, () => {
      const dirPkg = join(ROOT, 'packages', p);
      expect(existsSync(join(dirPkg, 'dist')), 'build packages first (pnpm build)').toBe(true);
      const r = sh('npm pack --dry-run --json 2>/dev/null', dirPkg);
      const files = (JSON.parse(r.stdout)[0].files as { path: string }[]).map((f) => f.path);
      expect(files.filter((f) => f.endsWith('.tsbuildinfo'))).toEqual([]);
    });
  }
  it('BUG-14 package versions are consistent with each other and with PROJECT_MAP release (v0.4.0)', () => {
    const versions = PKGS.map((p) => pkgJson(p).version as string);
    const map = readFileSync(join(ROOT, 'PROJECT_MAP.md'), 'utf8').match(/\*\*v(\d+\.\d+\.\d+)/)?.[1];
    expect(new Set(versions).size).toBe(1);
    expect(versions[0]).toBe(map);
  });
  it('BUG-14 repository has a LICENSE file', () => {
    expect(readdirSync(ROOT).some((f) => /^LICEN[SC]E(\.|$)/i.test(f))).toBe(true);
  });
  it('BUG-14 every package listed in README exists in packages/', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    const listed = [...readme.matchAll(/`@reports-web\/([a-z0-9-]+)`/g)].map((m) => m[1]!);
    const existing = readdirSync(join(ROOT, 'packages')).map((d) => { try { return pkgJson(d).name.split('/')[1]; } catch { return d; } });
    expect([...new Set(listed)].filter((n) => !existing.includes(n))).toEqual([]);
  });
});
