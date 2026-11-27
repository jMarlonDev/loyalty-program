import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import {
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'loyalty-realtime-'));
const fixtureKey = randomBytes(32).toString('hex');
const children = new Set();
let browser;
let output = '';

async function port() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  assert(address && typeof address !== 'string');
  return address.port;
}

function spawnNode(args, env) {
  const child = spawn(process.execPath, args, {
    cwd: temporary,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.add(child);
  child.stdout.on('data', (data) => {
    output = (output + data).slice(-12000);
  });
  child.stderr.on('data', (data) => {
    output = (output + data).slice(-12000);
  });
  return child;
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    children.delete(child);
    return;
  }
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const forced = setTimeout(() => child.kill('SIGKILL'), 4000);
  await exited;
  clearTimeout(forced);
  children.delete(child);
}

async function ready(origin, child) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Fixture exited: ${output}`);
    try {
      if ((await fetch(origin, { signal: AbortSignal.timeout(500) })).ok)
        return;
    } catch {
      /* Wait for the isolated server. */
    }
    await delay(100);
  }
  throw new Error(`Fixture not ready: ${output}`);
}

async function exercise(origin, mode) {
  const cardId = '11111111-1111-4111-8111-111111111111';
  const contexts = [];
  async function client(session) {
    const context = await browser.newContext();
    contexts.push(context);
    if (session)
      await context.addCookies([
        {
          name: 'fixture_session',
          value: session,
          url: origin,
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);
    const page = await context.newPage();
    await page.goto(origin);
    return page;
  }
  async function connect(page, path = '/api/v1/customer/events') {
    return page.evaluate(
      (path) =>
        new Promise((resolve) => {
          const timeout = setTimeout(() => resolve('timeout'), 8000);
          const done = (result) => {
            clearTimeout(timeout);
            resolve(result);
          };
          const socket = new WebSocket(
            location.origin.replace('http:', 'ws:') + path,
          );
          globalThis.fixtureSocket = socket;
          globalThis.fixtureMessages = [];
          globalThis.fixtureClosed = false;
          socket.onmessage = (event) =>
            globalThis.fixtureMessages.push(JSON.parse(event.data));
          socket.onclose = () => {
            globalThis.fixtureClosed = true;
          };
          socket.onopen = () => done('open');
          socket.onerror = () => done('rejected');
        }),
      path,
    );
  }
  async function control(body) {
    const result = await fetch(`${origin}/control`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-fixture-key': fixtureKey,
      },
      body: JSON.stringify(body),
    });
    assert.equal(result.status, 200);
    return result.json();
  }
  try {
    const first = await client('fixture-a');
    const second = await client('fixture-b');
    const other = await client('fixture-other');
    const anonymous = await client();
    assert.equal(await connect(anonymous), 'rejected');
    const [firstResult, secondResult, otherResult] = await Promise.all([
      connect(first),
      connect(second),
      connect(other),
    ]);
    assert.deepEqual(
      [firstResult, secondResult, otherResult],
      ['open', 'open', 'open'],
    );
    for (const page of [first, second, other]) {
      await page.evaluate(
        (cardId) =>
          globalThis.fixtureSocket.send(
            JSON.stringify({ type: 'subscribe', card_id: cardId }),
          ),
        cardId,
      );
      await page.waitForFunction(() => globalThis.fixtureMessages.length > 0);
    }
    assert.equal(
      await other.evaluate(() => globalThis.fixtureMessages[0].code),
      'NOT_FOUND',
    );
    await control({ type: 'publish' });
    for (const page of [first, second])
      await page.waitForFunction(() =>
        globalThis.fixtureMessages.some(
          (message) => message.type === 'purchase.recorded',
        ),
      );
    assert.equal(
      await other.evaluate(() => globalThis.fixtureMessages.length),
      1,
    );
    assert.deepEqual(
      await first.evaluate(() =>
        Object.keys(globalThis.fixtureMessages[1]).sort(),
      ),
      ['card_id', 'event_id', 'type', 'version'],
    );
    await control({ type: 'revoke', session: 'fixture-a' });
    await first.waitForFunction(() => globalThis.fixtureClosed);
    assert.equal(await connect(first), 'rejected');
    await second.evaluate(() =>
      globalThis.fixtureSocket.send('x'.repeat(2049)),
    );
    await second.waitForFunction(() => globalThis.fixtureClosed);
    await control({ type: 'close' });
    const status = await control({ type: 'status' });
    assert.equal(status.connections, 0);
    console.info(
      `${mode}: WebSocket real, dos contextos autorizados, anonimato/aislamiento/revocación/límite/limpieza correctos.`,
    );
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
}

try {
  await symlink(
    join(root, 'node_modules'),
    join(temporary, 'node_modules'),
    'dir',
  );
  await mkdir(join(temporary, 'tests/realtime'), { recursive: true });
  await mkdir(join(temporary, 'src/server'), { recursive: true });
  for (const filename of [
    'fixture-runtime.ts',
    'fixture-events.ts',
    'fixture-control.ts',
  ]) {
    await copyFile(
      join(root, 'tests/realtime', filename),
      join(temporary, 'tests/realtime', filename),
    );
  }
  await copyFile(
    join(root, 'src/server/customer-events.ts'),
    join(temporary, 'src/server/customer-events.ts'),
  );
  await writeFile(
    join(temporary, 'package.json'),
    JSON.stringify({ type: 'module' }),
  );
  await writeFile(
    join(temporary, 'index.html'),
    '<!doctype html><html lang="es"><title>Transporte aislado</title><body>Fixture WebSocket</body></html>',
  );
  await writeFile(
    join(temporary, 'vite.config.ts'),
    `import { defineConfig } from 'vite';
import { nitro } from 'nitro/vite';
export default defineConfig({ server: { fs: { allow: [${JSON.stringify(root)}, ${JSON.stringify(temporary)}] } }, plugins: [nitro({ preset: 'node-server', buildDir: './.nitro', features: { websocket: true }, handlers: [
  { route: '/api/v1/customer/events', handler: './tests/realtime/fixture-events.ts' },
  { route: '/control', handler: './tests/realtime/fixture-control.ts' }
] })] });`,
  );
  browser = await chromium.launch({ channel: 'chromium', headless: true });
  const vite = join(root, 'node_modules/vite/bin/vite.js');
  for (const mode of ['development', 'production']) {
    const assignedPort = await port();
    const origin = `http://127.0.0.1:${assignedPort}`;
    const env = {
      REALTIME_FIXTURE_ORIGIN: origin,
      REALTIME_FIXTURE_KEY: fixtureKey,
      HOST: '127.0.0.1',
      PORT: String(assignedPort),
    };
    if (mode === 'production') {
      const build = spawnNode([vite, 'build'], env);
      const [status] = await once(build, 'exit');
      children.delete(build);
      assert.equal(status, 0, `Fixture build failed: ${output}`);
    }
    const child = spawnNode(
      mode === 'development'
        ? [
            vite,
            '--host',
            '127.0.0.1',
            '--port',
            String(assignedPort),
            '--strictPort',
          ]
        : [join(temporary, '.output/server/index.mjs')],
      env,
    );
    await ready(origin, child);
    await exercise(origin, mode);
    await stop(child);
  }
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message.replaceAll(fixtureKey, '[redacted]')
      : 'Realtime fixture failed',
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  await Promise.all([...children].map(stop));
  await rm(temporary, { recursive: true, force: true });
}
