import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const selected = args.some(
  (arg) => arg === '--project' || arg.startsWith('--project='),
);
const projects = selected ? [null] : ['desktop', 'mobile'];
const base = [
  'node_modules/@playwright/test/cli.js',
  'test',
  '--config',
  'tests/browser/playwright.config.ts',
];
function run(extra, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...base, ...extra], {
      cwd,
      env: process.env,
      stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    });
    let output = '';
    child.stdout?.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', reject);
    child.on('exit', (status) => resolve({ status: status ?? 1, output }));
  });
}
function titles(suites) {
  return suites.flatMap((suite) => [
    ...(suite.specs ?? []).map((spec) => spec.title),
    ...titles(suite.suites ?? []),
  ]);
}
// Each independent scenario gets its own server/database/rate-limit window.
// Browsers in the same scenario still share the real production limits.
for (const project of projects) {
  const selection = [...args, ...(project ? ['--project', project] : [])];
  const listing = await run([...selection, '--list', '--reporter=json'], true);
  if (listing.status !== 0) {
    process.exitCode = listing.status;
    break;
  }
  const scenarios = [...new Set(titles(JSON.parse(listing.output).suites))];
  if (!scenarios.length) throw new Error('No browser scenarios selected.');
  for (const [index, title] of scenarios.entries()) {
    const pattern = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const result = await run([
      ...selection,
      '--grep',
      `${pattern}$`,
      '--output',
      `test-results/${project ?? 'selected'}/scenario-${index + 1}`,
    ]);
    if (result.status !== 0) {
      process.exitCode = result.status;
      break;
    }
  }
  if (process.exitCode) break;
}
