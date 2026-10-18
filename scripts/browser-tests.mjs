import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const selected = args.some(
  (arg) => arg === '--project' || arg.startsWith('--project='),
);
// Each viewport gets its own server, database and rate-limit window. Running
// both against one loopback address would combine independent users' traffic.
const projects = selected ? [null] : ['desktop', 'mobile'];
for (const project of projects) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config',
        'tests/browser/playwright.config.ts',
        ...(project
          ? ['--project', project, '--output', `test-results/${project}`]
          : []),
        ...args,
      ],
      { cwd, env: process.env, stdio: 'inherit' },
    );
    child.on('error', reject);
    child.on('exit', (status) => resolve(status ?? 1));
  });
  if (code !== 0) {
    process.exitCode = Number(code);
    break;
  }
}
