import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const name = `loyalty-test-${randomBytes(6).toString('hex')}`;
const password = randomBytes(24).toString('hex');
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, ...options });
    let output = '';
    child.stdout?.on('data', (data) => {
      output += data;
    });
    child.stderr?.on('data', (data) => {
      output += data;
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve(output.trim())
        : reject(new Error(`${command} failed (${code}): ${output}`)),
    );
  });
}
let started = false;
async function cleanup() {
  if (started) {
    started = false;
    // --rm may already have removed a container that failed during startup.
    const existing = await run('docker', [
      'ps',
      '-aq',
      '--filter',
      `name=^/${name}$`,
    ]);
    if (existing) await run('docker', ['stop', name]);
  }
}
try {
  await run('docker', [
    'run',
    '--detach',
    '--rm',
    '--name',
    name,
    '-e',
    'POSTGRES_USER=loyalty_test',
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '-e',
    'POSTGRES_DB=loyalty_test_control',
    '-p',
    '127.0.0.1::5432',
    'postgres:17',
  ]);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await run('docker', [
        'exec',
        name,
        'pg_isready',
        '-h',
        '127.0.0.1',
        '-U',
        'loyalty_test',
        '-d',
        'loyalty_test_control',
      ]);
      ready = true;
      break;
    } catch {
      await delay(500);
    }
  }
  if (!ready)
    throw new Error('PostgreSQL test container did not become ready.');
  const binding = await run('docker', ['port', name, '5432/tcp']);
  const port = /^127\.0\.0\.1:(\d+)$/.exec(binding)?.[1];
  if (!port) throw new Error('Unexpected test container binding.');
  const env = {
    ...process.env,
    TEST_DATABASE_URL: `postgresql://loyalty_test:${password}@127.0.0.1:${port}/loyalty_test_control`,
  };
  delete env.DATABASE_URL;
  const browser = process.argv[2] === '--browser';
  const browserArgs = process.argv
    .slice(3)
    .filter((value) => value !== '--production');
  if (browser && process.argv.includes('--production'))
    env.LOYALTY_BROWSER_PRODUCTION = '1';
  const args = browser
    ? ['--prefix', '..', 'run', 'test:browser', '--', ...browserArgs]
    : ['test', '--', ...process.argv.slice(2)];
  await run('npm', args, {
    env,
    stdio: 'inherit',
  });
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message.replaceAll(password, '[redacted]')
      : 'Test database command failed.',
  );
  process.exitCode = 1;
} finally {
  await cleanup();
}
