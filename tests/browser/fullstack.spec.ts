import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from '@playwright/test';

const origin = 'http://127.0.0.1:3100';
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map(({ id, nodes }) => ({
      id,
      nodes: nodes.map(({ target, failureSummary }) => ({
        target,
        failureSummary,
      })),
    })),
  ).toEqual([]);
}
async function login(request: APIRequestContext, email: string) {
  const response = await request.post('/api/session', {
    headers: { Origin: origin },
    data: { action: 'login', email, password: 'test-password-123' },
  });
  expect(response.ok()).toBeTruthy();
  const profile = await request.post('/api/v1/profiles', {
    headers: { Origin: origin },
    data: { full_name: email.split('@')[0] },
  });
  expect([200, 201]).toContain(profile.status());
}
async function call(request: APIRequestContext, path: string, body: unknown) {
  const response = await request.post(`/api/v1${path}`, {
    headers: { Origin: origin, 'Idempotency-Key': randomUUID() },
    data: body,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).data;
}
test('pantalla inicial y acceso son legibles sin desbordamiento', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /Un buen motivo/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await accessible(page);
  await page.screenshot({
    path: testInfo.outputPath('landing.png'),
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Iniciar sesión' }).click();
  await expect(
    page.getByRole('heading', { name: 'Qué gusto verte.' }),
  ).toBeVisible();
  await accessible(page);
  await page.screenshot({
    path: testInfo.outputPath('auth.png'),
    fullPage: true,
  });
  await page.getByLabel('Correo electrónico').fill('owner-ui@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('alert')).toContainText('No se pudo validar');
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('test-password-123');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole('heading', { name: 'Aquí empiezan las buenas visitas' }),
  ).toBeVisible();
  await accessible(page);
  const cookies = await page.context().cookies();
  expect(
    cookies
      .filter((c) => c.name.startsWith('loyalty-'))
      .every((c) => c.httpOnly),
  ).toBe(true);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('Start comunica restaurante, programa público, inscripción y tarjeta con QR', async ({
  page,
  playwright,
}) => {
  const owner = await playwright.request.newContext({ baseURL: origin });
  const suffix = randomUUID().slice(0, 8);
  try {
    await login(owner, `owner-${suffix}@example.test`);
    const restaurant = await call(owner, '/restaurants', {
      name: `Negocio ${suffix}`,
      slug: `negocio-${suffix}`,
    });
    const location = await call(
      owner,
      `/restaurants/${restaurant.id}/locations`,
      {
        name: 'Centro',
        address: 'Calle 1',
        city: 'Bogotá',
        department: 'Bogotá',
      },
    );
    const program = await call(
      owner,
      `/restaurants/${restaurant.id}/programs`,
      {
        name: `Club frecuente ${suffix}`,
        stamps_required: 2,
        reward_description: 'Una recompensa de regalo',
        background_color: '#214E40',
        text_color: '#FFFFFF',
      },
    );
    await page.goto(`/join/${program.public_code}`);
    await expect(
      page.getByRole('heading', { name: program.name }),
    ).toBeVisible();
    await login(page.request, `customer-${suffix}@example.test`);
    await page.reload();
    await page
      .getByRole('button', {
        name: /Obtener mi tarjeta|Quiero mi tarjeta|Unirme/,
      })
      .click();
    await page.getByRole('link', { name: 'Ver mi tarjeta' }).click();
    await expect(page).toHaveURL(/\/cards\?card=/);
    await expect(
      page.getByText('Una recompensa de regalo').first(),
    ).toBeVisible();
    const cards = await page.request.get('/api/v1/me/cards');
    const card = (await cards.json()).data[0];
    expect(card).toBeTruthy();
    // Authorization travels through the same Start cookie bridge; customers cannot stamp themselves.
    const forbidden = await page.request.post(
      `/api/v1/restaurants/${restaurant.id}/purchases`,
      {
        headers: { Origin: origin, 'Idempotency-Key': randomUUID() },
        data: {
          card_id: card.id,
          location_id: location.id,
          sale_reference: `sale-${suffix}`,
        },
      },
    );
    expect([403, 404]).toContain(forbidden.status());
    await call(owner, `/restaurants/${restaurant.id}/purchases`, {
      card_id: card.id,
      location_id: location.id,
      sale_reference: `sale-${suffix}`,
    });
    await page.reload();
    await expect(page.getByText(/1\s*\/\s*2/).first()).toBeVisible();
    await expect(page.locator('svg[aria-label*="QR"]').first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await owner.dispose();
  }
});

test('Google PKCE restaura sesión HttpOnly y permite reintentar caída temporal', async ({
  page,
}) => {
  await page.goto('/auth?next=%2Fcards');
  await page.getByRole('button', { name: 'Google', exact: true }).click();
  await expect(page).toHaveURL(/\/cards$/);
  await expect(
    page.getByRole('heading', { name: 'Mis tarjetas', exact: true }),
  ).toBeVisible();
  const cookies = await page.context().cookies();
  expect(
    cookies.find((cookie) => cookie.name === 'loyalty-access')?.httpOnly,
  ).toBe(true);
  expect(cookies.some((cookie) => cookie.name === 'loyalty-verifier')).toBe(
    false,
  );
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    'loyalty-access',
  );
  await page.context().clearCookies({ name: 'loyalty-access' });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Mis tarjetas', exact: true }),
  ).toBeVisible();
  await page.route('**/api/session', async (route) => {
    if (route.request().method() === 'GET')
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'Conexión temporalmente interrumpida' },
        }),
      });
    else await route.continue();
  });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText(
    'Conexión temporalmente interrumpida',
  );
  await expect(
    page.getByRole('link', { name: 'Entrar a mis tarjetas' }),
  ).toHaveCount(0);
  await page.unroute('**/api/session');
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Mis tarjetas', exact: true }),
  ).toBeVisible();
});

test('formularios crean el programa personalizado y registran compras y entrega', async ({
  page,
  playwright,
}, testInfo) => {
  const suffix = randomUUID().slice(0, 8);
  await login(page.request, `ui-${suffix}@example.test`);
  await page.goto('/app');
  await page
    .getByLabel('Nombre del restaurante', { exact: true })
    .fill(`Negocio UI ${suffix}`);
  await page.getByLabel('Identificador único').fill(`ui-${suffix}`);
  await page
    .getByRole('button', { name: 'Crear restaurante', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Sucursales', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Agregar sucursal' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Centro');
  await page.getByLabel('Dirección', { exact: true }).fill('Calle 1');
  await page.getByLabel('Ciudad', { exact: true }).fill('Bogotá');
  await page.getByLabel('Departamento / región').fill('Bogotá');
  await page.getByRole('button', { name: 'Guardar sucursal' }).click();
  await expect(
    page.getByRole('heading', { name: 'Centro', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Programas', exact: true }).click();
  await page
    .getByRole('button', { name: 'Crear tarjeta', exact: true })
    .click();
  await page.getByLabel('Nombre de la tarjeta').fill(`Club UI ${suffix}`);
  await page.getByLabel('Sellos para ganar').fill('2');
  await page
    .getByLabel('Recompensa', { exact: true })
    .fill('Recompensa especial');
  await page.getByLabel('Color de fondo').fill('#214e40');
  await page
    .getByLabel('Mensaje de tu tarjeta')
    .fill('Siempre hay una razón para volver.');
  await page
    .getByRole('button', { name: 'Crear tarjeta', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Tu tarjeta está lista para compartir' }),
  ).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Comparte tu programa' }),
  ).toBeVisible();
  await accessible(page);
  await page.screenshot({
    path: testInfo.outputPath('workspace-program.png'),
    fullPage: true,
  });
  const restaurants = (
    await (await page.request.get('/api/v1/restaurants')).json()
  ).data;
  const restaurant = restaurants.find(
    (r: { slug: string }) => r.slug === `ui-${suffix}`,
  );
  const programs = (
    await (
      await page.request.get(`/api/v1/restaurants/${restaurant.id}/programs`)
    ).json()
  ).data;
  const program = programs[0];
  expect(program.background_color.toLowerCase()).toBe('#214e40');
  expect(program.card_message).toBe('Siempre hay una razón para volver.');
  const customer = await playwright.request.newContext({ baseURL: origin });
  try {
    await login(customer, `ui-customer-${suffix}@example.test`);
    const enrollment = await call(
      customer,
      `/public/programs/${program.public_code}/enrollments`,
      {},
    );
    const card = enrollment.card;
    const token = (
      await (await customer.get(`/api/v1/me/cards/${card.id}/qr`)).json()
    ).data.token;
    await page.context().clearCookies();
    await page.goto(`/scan#token=${token}&restaurant=${restaurant.id}`);
    await page
      .getByRole('link', { name: 'Iniciar sesión para agregar un sello' })
      .click();
    await expect(page).toHaveURL(/\/auth\?next=%2Fscan$/);
    await page
      .getByLabel('Correo electrónico')
      .fill(`ui-${suffix}@example.test`);
    await page
      .getByLabel('Contraseña', { exact: true })
      .fill('test-password-123');
    await page
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click();
    await expect(page.getByLabel('Referencia única de venta')).toBeVisible();
    await expect(page).toHaveURL(`${origin}/scan`);
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem('loyalty.pending-card-scan'),
      ),
    ).toBeNull();
    expect(
      (await (await customer.get(`/api/v1/me/cards/${card.id}`)).json()).data
        .balance,
    ).toBe(0);
    await accessible(page);
    await page.screenshot({
      path: testInfo.outputPath('scan-form.png'),
      fullPage: true,
    });
    for (let i = 1; i <= 2; i++) {
      await page
        .getByLabel('Referencia única de venta')
        .fill(`UI-${suffix}-${i}`);
      await page
        .getByRole('button', { name: 'Registrar compra y sumar un sello' })
        .click();
      await expect(page.getByRole('status')).toContainText('Compra registrada');
    }
    const rewards = (
      await (await customer.get(`/api/v1/me/cards/${card.id}/rewards`)).json()
    ).data;
    expect(rewards).toHaveLength(1);
    await page
      .getByRole('button', { name: 'Entregar premio', exact: true })
      .click();
    await page.getByLabel('Premio disponible').selectOption(rewards[0].id);
    await page
      .getByRole('button', { name: 'Confirmar entrega del premio' })
      .click();
    await expect(page.getByRole('status')).toContainText('Premio entregado');
    expect(
      (await (await customer.get(`/api/v1/me/cards/${card.id}/rewards`)).json())
        .data[0].status,
    ).toBe('redeemed');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await customer.dispose();
  }
});

test('registro y recuperación conservan PKCE hasta el callback de correo simulado', async ({
  page,
}) => {
  const email = `signup-${randomUUID().slice(0, 8)}@example.test`;
  await page.goto('/auth?mode=signup');
  await page.getByRole('button', { name: 'Mis tarjetas', exact: true }).click();
  await page.getByLabel('Nombre completo').fill('Ana Prueba');
  await page.getByLabel('Correo electrónico').fill(email);
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('test-password-123');
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Revisa tu correo');
  const mail = await page.request.get(
    `http://127.0.0.1:3101/__test/mail?email=${encodeURIComponent(email)}`,
  );
  expect(mail.ok()).toBe(true);
  await page.goto((await mail.json()).url);
  await expect(page).toHaveURL(/\/cards$/);
  await expect(
    page.getByRole('heading', { name: 'Tu primera tarjeta te espera' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await expect(page).toHaveURL(`${origin}/`);
  await page.goto('/auth?mode=recover');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByRole('button', { name: 'Enviar enlace' }).click();
  await expect(page.getByRole('status')).toContainText('recibirás un enlace');
  const reset = await page.request.get(
    `http://127.0.0.1:3101/__test/mail?email=${encodeURIComponent(email)}`,
  );
  await page.goto((await reset.json()).url);
  await expect(
    page.getByRole('heading', { name: 'Tu nueva contraseña.' }),
  ).toBeVisible();
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('changed-password-456');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Contraseña actualizada',
  );
  await page.getByRole('link', { name: 'Continuar', exact: true }).click();
  await page
    .getByRole('button', { name: 'Cerrar sesión', exact: true })
    .click();
  await expect(page).toHaveURL(`${origin}/`);
  await page.goto('/auth');
  const oldPassword = await page.request.post('/api/session', {
    headers: { Origin: origin },
    data: { action: 'login', email, password: 'test-password-123' },
  });
  expect(oldPassword.status()).toBe(401);
  await page.getByLabel('Correo electrónico').fill(email);
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('changed-password-456');
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click();
  await expect(page).toHaveURL(/\/app$/);
});
