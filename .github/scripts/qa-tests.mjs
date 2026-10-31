import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Vitest colors the summary (`\x1b[32m318 passed\x1b[39m`). Drop SGR sequences before matching. */
export function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-9;]*m/g, '');
}

export function countTests(text) {
  const clean = stripAnsi(text);
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let todo = 0;
  let parsed = false;

  for (const line of clean.split(/\r?\n/)) {
    if (!/^\s*Tests\b/.test(line)) continue;
    parsed = true;
    const fail = line.match(/(\d+)\s+failed\b/);
    const pass = line.match(/(\d+)\s+passed\b/);
    const skip = line.match(/(\d+)\s+skipped\b/);
    const td = line.match(/(\d+)\s+todo\b/);
    if (fail) failed += Number(fail[1]);
    if (pass) passed += Number(pass[1]);
    if (skip) skipped += Number(skip[1]);
    if (td) todo += Number(td[1]);
  }

  if (!parsed) {
    const passing = [...clean.matchAll(/(\d+)\s+passing\b/g)];
    const failing = [...clean.matchAll(/(\d+)\s+failing\b/g)];
    if (passing.length > 0 || failing.length > 0) {
      parsed = true;
      passed = passing.reduce((sum, match) => sum + Number(match[1]), 0);
      failed = failing.reduce((sum, match) => sum + Number(match[1]), 0);
    }
  }

  return { passed, failed, skipped, todo, parsed };
}

/**
 * Totals from a vitest JSON report (`numPassedTests` / `numFailedTests` /
 * `numPendingTests` / `numTodoTests`). Returns null when `jsonText` is empty,
 * not JSON, or lacks those numbers. Text parsing is used only when the report
 * file itself is missing.
 */
export function totalsFromReport(jsonText) {
  if (jsonText == null || String(jsonText).trim() === '') return null;
  let report;
  try {
    report = JSON.parse(jsonText);
  } catch {
    return null;
  }
  const passed = report?.numPassedTests;
  const failed = report?.numFailedTests;
  const skipped = report?.numPendingTests;
  const todo = report?.numTodoTests;
  if (![passed, failed, skipped, todo].every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return null;
  }
  return { passed, failed, skipped, todo, parsed: true };
}

/** Names of skipped / todo tests from a vitest JSON report (empty lists when unavailable). */
export function listNotRun(jsonText) {
  const skippedNames = [];
  const todoNames = [];
  try {
    const report = JSON.parse(jsonText);
    for (const file of report.testResults ?? []) {
      const rel = relative(process.cwd(), String(file.name ?? '')) || String(file.name ?? '');
      for (const test of file.assertionResults ?? []) {
        const name = `${rel} > ${test.fullName ?? test.title}`;
        if (test.status === 'todo') todoNames.push(name);
        else if (test.status === 'skipped' || test.status === 'pending' || test.status === 'disabled') skippedNames.push(name);
      }
    }
  } catch {
    /* no or unreadable JSON report: counts still come from the text summary */
  }
  return { skippedNames, todoNames };
}

/** Same probe the QA tests use (`pdftotext -v` must run and exit 0). */
export function hasPdftotext() {
  const probe = spawnSync('pdftotext', ['-v'], { stdio: 'ignore' });
  return !probe.error && probe.status === 0;
}

/** QA_REQUIRE_PDFTOTEXT=1 (or true) turns a missing pdftotext into a failure; default is warn only. */
export function requirePdftotext(env = process.env) {
  const value = String(env.QA_REQUIRE_PDFTOTEXT ?? '').toLowerCase();
  return value === '1' || value === 'true';
}

const PDFTOTEXT_MISSING =
  'pdftotext (poppler-utils) is not installed: the BUG-23 "poppler pdftotext" QA checks are SKIPPED.';

function printSummary({ passed, failed, skipped = 0, todo = 0, skippedNames = [], todoNames = [] }, note) {
  console.log('--- QA summary ---');
  console.log(`passed: ${passed}`);
  console.log(`failed: ${failed}`);
  console.log(`skipped: ${skipped}`);
  console.log(`todo: ${todo}`);
  if (skippedNames.length > 0) {
    console.log('skipped tests:');
    for (const name of skippedNames) console.log(`  - ${name}`);
  }
  if (todoNames.length > 0) {
    console.log('todo tests:');
    for (const name of todoNames) console.log(`  - ${name}`);
  }
  if (note) console.log(note);
}

function main() {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const qaScript = packageJson.scripts?.['test:qa'];

  if (typeof qaScript !== 'string' || qaScript.length === 0) {
    printSummary({ passed: 0, failed: 0 }, 'skipped: root package.json has no test:qa script.');
    process.exit(0);
  }

  const required = requirePdftotext();
  const pdftotext = hasPdftotext();
  if (!pdftotext) {
    console.log(`::warning title=QA: pdftotext missing::${PDFTOTEXT_MISSING}`);
    console.warn(`warning: ${PDFTOTEXT_MISSING} Install poppler-utils to run them.`);
  }

  const reportDir = mkdtempSync(join(tmpdir(), 'qa-report-'));
  const reportFile = join(reportDir, 'qa.json');
  const child = spawn(
    'pnpm',
    ['test:qa', '--reporter=default', '--reporter=json', `--outputFile.json=${reportFile}`],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    },
  );

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
    rmSync(reportDir, { recursive: true, force: true });
    printSummary({ passed: 0, failed: 0 }, `pnpm test:qa could not be started: ${error.message}`);
    if (required && !pdftotext) {
      console.error(`QA FAILED: ${PDFTOTEXT_MISSING} QA_REQUIRE_PDFTOTEXT=1 requires them to run; install poppler-utils.`);
      console.log(`::error title=QA: pdftotext missing::${PDFTOTEXT_MISSING} (QA_REQUIRE_PDFTOTEXT=1)`);
    }
    console.error('QA FAILED: pnpm test:qa could not be started.');
    process.exit(1);
  });

  child.on('close', (code) => {
    let json = '';
    let jsonMissing = true;
    try {
      json = readFileSync(reportFile, 'utf8');
      jsonMissing = json.trim() === '';
    } catch {
      /* report not written */
    }
    rmSync(reportDir, { recursive: true, force: true });
    // Prefer the JSON report. Text (ANSI-stripped) is only the fallback when that file is missing.
    const fromJson = jsonMissing ? null : totalsFromReport(json);
    const counts = fromJson ?? (jsonMissing
      ? countTests(output)
      : { passed: 0, failed: 0, skipped: 0, todo: 0, parsed: false });
    const names = listNotRun(json);
    const note = counts.parsed
      ? `command exit code: ${code ?? 'unknown'}`
      : `could not parse test totals from pnpm test:qa output (exit code: ${code ?? 'unknown'}).`;
    printSummary(
      counts.parsed ? { ...counts, ...names } : { passed: 0, failed: 0, ...names },
      note,
    );

    let exitCode = 0;
    if (!pdftotext) {
      if (required) {
        console.error(`QA FAILED: ${PDFTOTEXT_MISSING} QA_REQUIRE_PDFTOTEXT=1 requires them to run; install poppler-utils.`);
        console.log(`::error title=QA: pdftotext missing::${PDFTOTEXT_MISSING} (QA_REQUIRE_PDFTOTEXT=1)`);
        exitCode = 1;
      } else {
        console.warn(`warning: ${PDFTOTEXT_MISSING} Not failing (set QA_REQUIRE_PDFTOTEXT=1 to make this an error).`);
      }
    }

    // A green summary is not enough: fail the process when tests failed, vitest
    // itself exited non-zero (or was signalled), or the totals could not be parsed.
    const vitestFailed = code !== 0;
    if (!counts.parsed || counts.failed > 0 || vitestFailed) {
      const reasons = [];
      if (!counts.parsed) reasons.push('could not parse test totals');
      if (counts.parsed && counts.failed > 0) reasons.push(`${counts.failed} test(s) failed`);
      if (vitestFailed) reasons.push(`pnpm test:qa exited ${code ?? 'unknown'}`);
      console.error(`QA FAILED: ${reasons.join('; ')}.`);
      exitCode = 1;
    }

    process.exit(exitCode);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
