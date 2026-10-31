import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function countTests(text) {
  let passed = 0;
  let failed = 0;
  let parsed = false;

  for (const line of text.split(/\r?\n/)) {
    if (!/^\s*Tests\b/.test(line)) continue;
    parsed = true;
    const fail = line.match(/(\d+)\s+failed\b/);
    const pass = line.match(/(\d+)\s+passed\b/);
    if (fail) failed += Number(fail[1]);
    if (pass) passed += Number(pass[1]);
  }

  if (!parsed) {
    const passing = [...text.matchAll(/(\d+)\s+passing\b/g)];
    const failing = [...text.matchAll(/(\d+)\s+failing\b/g)];
    if (passing.length > 0 || failing.length > 0) {
      parsed = true;
      passed = passing.reduce((sum, match) => sum + Number(match[1]), 0);
      failed = failing.reduce((sum, match) => sum + Number(match[1]), 0);
    }
  }

  return { passed, failed, parsed };
}

function printSummary(passed, failed, note) {
  console.log('--- QA summary ---');
  console.log(`passed: ${passed}`);
  console.log(`failed: ${failed}`);
  if (note) console.log(note);
}

function main() {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const qaScript = packageJson.scripts?.['test:qa'];

  if (typeof qaScript !== 'string' || qaScript.length === 0) {
    printSummary(0, 0, 'skipped: root package.json has no test:qa script.');
    process.exit(0);
  }

  const child = spawn('pnpm', ['test:qa'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  let output = '';
  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
    output += chunk.toString();
  });

  child.on('error', (error) => {
    printSummary(0, 0, `pnpm test:qa could not be started: ${error.message}`);
    process.exit(0);
  });

  child.on('close', (code) => {
    const { passed, failed, parsed } = countTests(output);
    const note = parsed
      ? `command exit code: ${code ?? 'unknown'}`
      : `could not parse test totals from pnpm test:qa output (exit code: ${code ?? 'unknown'}).`;
    printSummary(parsed ? passed : 0, parsed ? failed : 0, note);
    process.exit(0);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
