import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test';
import { BrowserQRCodeReader } from '@zxing/browser';

const useHttps = process.env.LOYALTY_BROWSER_HTTPS === '1';
const origin = useHttps ? 'https://127.0.0.1:3102' : 'http://127.0.0.1:3100';
const cookiePrefix = useHttps ? '__Host-loyalty-' : 'loyalty-';
const customerCookie = useHttps
  ? '__Host-loyalty_customer'
  : 'loyalty_customer_dev';
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
async function confirmSignup(page: Page, email: string, name: string) {
  await page.getByLabel('Nombre completo').fill(name);
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
}
async function decodeQr(qr: Locator) {
  // Decode the actual rendered SVG pixels, including its quiet zone and size.
  // Navigation below follows the encoded URL just as an external camera would.
  const pixels = await qr.evaluate(async (svg) => {
    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(svg)], {
        type: 'image/svg+xml',
      }),
    );
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(svg.getBoundingClientRect().width * 4);
      canvas.height = Math.ceil(svg.getBoundingClientRect().height * 4);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('QR canvas is unavailable');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return {
        width: canvas.width,
        height: canvas.height,
        data: Array.from(
          context.getImageData(0, 0, canvas.width, canvas.height).data,
        ),
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  const canvas = {
    width: pixels.width,
    height: pixels.height,
    getContext: () => ({
      getImageData: () => ({ data: new Uint8ClampedArray(pixels.data) }),
    }),
  } as unknown as HTMLCanvasElement;
  return new BrowserQRCodeReader().decodeFromCanvas(canvas).getText();
}
function mobileOptions(project: string) {
  return {
    isMobile: project === 'mobile',
    hasTouch: project === 'mobile',
  };
}
test('pantalla inicial y acceso de propietario son legibles sin desbordamiento', async ({
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
    page.getByRole('heading', { name: 'Tus tarjetas viven en tu teléfono' }),
  ).toBeVisible();
  await accessible(page);
  const cookies = await page.context().cookies();
  expect(
    cookies.filter((cookie) => cookie.name.startsWith(cookiePrefix)).length,
  ).toBeGreaterThanOrEqual(2);
  expect(
    cookies
      .filter((c) => c.name.startsWith(cookiePrefix))
      .every((c) => c.httpOnly),
  ).toBe(true);
  if (useHttps) {
    expect(
      cookies
        .filter((cookie) => cookie.name.startsWith(cookiePrefix))
        .every((cookie) => cookie.secure),
    ).toBe(true);
  }
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('Google PKCE restaura la sesión HttpOnly del propietario', async ({
  page,
}) => {
  await page.goto('/auth?next=%2Fapp%3Fonboarding%3Dbusiness');
  await page.getByRole('button', { name: 'Google', exact: true }).click();
  await expect(page).toHaveURL(/\/app\?onboarding=business$/);
  await expect(
    page.getByRole('heading', { name: 'Aquí empiezan las buenas visitas' }),
  ).toBeVisible();
  const cookies = await page.context().cookies();
  expect(
    cookies.find((cookie) => cookie.name === `${cookiePrefix}access`)?.httpOnly,
  ).toBe(true);
  expect(
    cookies.some((cookie) => cookie.name === `${cookiePrefix}verifier`),
  ).toBe(false);
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    'loyalty-access',
  );
  await page.context().clearCookies({ name: `${cookiePrefix}access` });
  await page.goto('/app?onboarding=business');
  await expect(
    page.getByRole('heading', { name: 'Aquí empiezan las buenas visitas' }),
  ).toBeVisible();
});

test('dueño, empleado y cliente completan compra, premio y nuevo ciclo sin recargar', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(240000);
  const suffix = randomUUID().slice(0, 8);
  const ownerEmail = `ui-${suffix}@example.test`;
  const employeeEmail = `employee-${suffix}@example.test`;
  const customerPhone = '3005550101';
  await login(page.request, ownerEmail);
  await page.goto('/app?onboarding=business');
  await page
    .getByLabel('Nombre del restaurante', { exact: true })
    .fill(`Negocio UI ${suffix}`);
  await expect(page.getByLabel('Identificador único')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Crear restaurante', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Tarjetas de lealtad', exact: true }),
  ).toBeVisible();
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
  const programQr = page.getByRole('img', { name: 'Comparte tu programa' });
  await expect(programQr).toBeVisible();
  const programUrl = await decodeQr(programQr);
  expect(programUrl).toMatch(new RegExp(`^${origin}/join/`));
  await accessible(page);
  await page.screenshot({
    path: testInfo.outputPath('workspace-program.png'),
    fullPage: true,
  });

  const restaurants = (
    await (await page.request.get('/api/v1/restaurants')).json()
  ).data;
  const restaurant = restaurants.find(
    (item: { name: string }) => item.name === `Negocio UI ${suffix}`,
  );
  expect(restaurant).toBeTruthy();
  expect(restaurant.actor_role).toBe('owner');
  const programs = (
    await (
      await page.request.get(`/api/v1/restaurants/${restaurant.id}/programs`)
    ).json()
  ).data;
  const program = programs[0];
  expect(program.background_color.toLowerCase()).toBe('#214e40');
  expect(program.card_message).toBe('Siempre hay una razón para volver.');
  expect(program.stamps_required).toBe(2);
  expect(programUrl).toBe(`${origin}/join/${program.public_code}`);

  await page.getByRole('button', { name: 'Equipo', exact: true }).click();
  await page.getByLabel('Correo', { exact: true }).fill(employeeEmail);
  await page.getByLabel('País', { exact: true }).selectOption('CO');
  await page.getByLabel('Teléfono', { exact: true }).fill('3001234567');
  await page
    .getByRole('button', { name: 'Crear invitación', exact: true })
    .click();
  const invitationCode = page.locator('code.code-block');
  await expect(invitationCode).toBeVisible();
  const invitationUrl = (await invitationCode.textContent())?.trim();
  expect(invitationUrl).toMatch(new RegExp(`^${origin}/invite/`));
  if (!invitationUrl) throw new Error('Invitation URL is unavailable');

  const viewport = page.viewportSize() ?? undefined;
  const employeeContext = await browser.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: useHttps,
    viewport,
    ...mobileOptions(testInfo.project.name),
  });
  const employee = await employeeContext.newPage();
  const customerContext = await browser.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: useHttps,
    viewport,
    ...mobileOptions(testInfo.project.name),
  });
  const customer = await customerContext.newPage();
  try {
    await employee.goto(invitationUrl);
    await employee
      .getByRole('link', { name: 'Crear cuenta de empleado' })
      .click();
    await confirmSignup(employee, employeeEmail, 'Empleado de prueba');
    await expect(employee).toHaveURL(invitationUrl);
    await employee
      .getByRole('button', { name: 'Aceptar invitación', exact: true })
      .click();
    await expect(employee.getByRole('status')).toContainText(
      'Ya formas parte del equipo',
    );
    await employee.getByRole('link', { name: 'Ir al escáner' }).click();
    await expect(
      employee.getByRole('heading', {
        name: 'Una visita, un sello',
        exact: true,
      }),
    ).toBeVisible();
    await expect(employee.locator('.role-label')).toHaveText('Empleado');
    for (const name of ['Mi programa', 'Equipo', 'Nuevo restaurante']) {
      await expect(
        employee.getByRole('button', { name, exact: true }),
      ).toHaveCount(0);
    }
    const forbiddenRestaurant = await employee.request.post(
      '/api/v1/restaurants',
      {
        headers: { Origin: origin, 'Idempotency-Key': randomUUID() },
        data: { name: 'Negocio no autorizado' },
      },
    );
    expect(forbiddenRestaurant.status()).toBe(403);

    await customer.goto(programUrl);
    await expect(
      customer.getByRole('heading', { name: /Nos gusta/ }),
    ).toBeVisible();
    await customer.getByLabel('País', { exact: true }).selectOption('CO');
    await customer.getByLabel('Teléfono', { exact: true }).fill(customerPhone);
    await customer
      .getByRole('button', { name: 'Obtener mi tarjeta', exact: true })
      .click();
    await expect(customer.getByRole('status')).toContainText(
      'Tu tarjeta está lista',
    );
    await customer.getByRole('link', { name: 'Ver mi tarjeta' }).click();
    await expect(customer).toHaveURL(/\/cards\?card=/);
    const cardId = new URL(customer.url()).searchParams.get('card');
    expect(cardId).toBeTruthy();
    if (!cardId) throw new Error('Customer card id is unavailable');
    await expect(
      customer.getByRole('img', { name: '0 de 2 sellos', exact: true }),
    ).toBeVisible();
    const customerCookies = await customerContext.cookies();
    const sessionCookie = customerCookies.find(
      (cookie) => cookie.name === customerCookie,
    );
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.sameSite).toBe('Lax');
    if (useHttps) expect(sessionCookie?.secure).toBe(true);
    expect(await customer.evaluate(() => Object.keys(localStorage))).toEqual(
      [],
    );

    await customer.goto(programUrl);
    await customer.getByRole('link', { name: 'Ver mi tarjeta' }).click();
    await expect(customer).toHaveURL(`${origin}/cards?card=${cardId}`);
    const customerCards = (
      await (await customer.request.get('/api/v1/customer/cards')).json()
    ).data;
    expect(customerCards).toHaveLength(1);
    expect(customerCards[0].id).toBe(cardId);
    const cardQr = customer.getByRole('img', {
      name: 'QR de tu tarjeta',
      exact: true,
    });
    await expect(cardQr).toBeVisible();
    const scanUrl = await decodeQr(cardQr);
    expect(scanUrl).toContain(`${origin}/scan#token=`);
    const cardToken = new URLSearchParams(new URL(scanUrl).hash.slice(1)).get(
      'token',
    );
    expect(cardToken).toBeTruthy();
    if (!cardToken) throw new Error('Card token is unavailable');
    const customerMutation = await customer.request.post(
      '/api/v1/operator/purchases',
      {
        headers: { Origin: origin, 'Idempotency-Key': randomUUID() },
        data: {
          restaurant_id: restaurant.id,
          token: cardToken,
          sale_reference: `CLIENTE-${suffix}`,
        },
      },
    );
    expect([401, 403, 404]).toContain(customerMutation.status());
    await accessible(customer);
    await customer.screenshot({
      path: testInfo.outputPath('customer-card.png'),
      fullPage: true,
    });

    let customerDocumentLoads = 0;
    customer.on('domcontentloaded', () => customerDocumentLoads++);
    await employee.goto(scanUrl);
    await expect(
      employee.getByRole('heading', {
        name: 'Una visita, un sello',
        exact: true,
      }),
    ).toBeVisible();
    await employee
      .getByLabel('Referencia única de venta')
      .fill(`UI-${suffix}-1`);
    await employee
      .getByRole('button', { name: 'Registrar compra · +1 sello' })
      .click();
    await expect(employee.getByRole('status')).toContainText(
      'Compra registrada. Se sumó un sello.',
    );
    await expect(
      customer.getByRole('img', { name: '1 de 2 sellos', exact: true }),
    ).toBeVisible({ timeout: 20000 });
    expect(customerDocumentLoads).toBe(0);

    await employee
      .getByLabel('Referencia única de venta')
      .fill(`UI-${suffix}-2`);
    await employee
      .getByRole('button', { name: 'Registrar compra · +1 sello' })
      .click();
    await expect(employee.getByRole('status')).toContainText(
      'El premio ya está disponible',
    );
    await expect(
      customer.getByRole('heading', { name: 'Tu premio', exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      customer.getByRole('img', { name: '2 de 2 sellos', exact: true }),
    ).toBeVisible();
    const rewardQr = customer.getByRole('img', {
      name: 'QR de tu premio',
      exact: true,
    });
    await expect(rewardQr).toBeVisible();
    const rewardUrl = await decodeQr(rewardQr);
    expect(rewardUrl).toContain(`${origin}/reward#`);
    const rewardToken = new URLSearchParams(
      new URL(rewardUrl).hash.slice(1),
    ).get('token');
    expect(rewardToken).toBeTruthy();
    if (!rewardToken) throw new Error('Reward token is unavailable');
    await accessible(customer);
    await customer.screenshot({
      path: testInfo.outputPath('customer-reward.png'),
      fullPage: true,
    });

    await employee.goto(rewardUrl);
    await expect(
      employee.getByRole('heading', {
        name: 'Entrega del premio',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      employee.getByText('Recompensa especial', { exact: true }).first(),
    ).toBeVisible();
    await employee
      .getByLabel('Confirmo que entregué el premio al cliente.')
      .check();
    await employee
      .getByRole('button', { name: 'Confirmar entrega y reiniciar ciclo' })
      .click();
    await expect(employee.getByRole('status')).toContainText(
      'Premio entregado. El nuevo ciclo empieza en cero.',
    );
    await expect(
      customer.getByRole('img', { name: '0 de 2 sellos', exact: true }),
    ).toBeVisible({ timeout: 20000 });
    expect(customerDocumentLoads).toBe(0);
    const updatedCard = (
      await (
        await customer.request.get(`/api/v1/customer/cards/${cardId}`)
      ).json()
    ).data;
    expect(updatedCard.cycle).toEqual(
      expect.objectContaining({ state: 'collecting', stamps: 0, target: 2 }),
    );

    const reusedReward = await employee.request.post(
      '/api/v1/operator/redemptions',
      {
        headers: { Origin: origin, 'Idempotency-Key': randomUUID() },
        data: {
          restaurant_id: restaurant.id,
          token: rewardToken,
          confirm: true,
        },
      },
    );
    expect(reusedReward.status()).toBe(409);
    const cardAsReward = await employee.request.post(
      '/api/v1/operator/redemptions',
      {
        headers: { Origin: origin, 'Idempotency-Key': randomUUID() },
        data: {
          restaurant_id: restaurant.id,
          token: cardToken,
          confirm: true,
        },
      },
    );
    expect(cardAsReward.status()).toBe(404);
    await accessible(employee);
    await employee.screenshot({
      path: testInfo.outputPath('employee-redemption.png'),
      fullPage: true,
    });
    await accessible(customer);
    await customer.screenshot({
      path: testInfo.outputPath('customer-next-cycle.png'),
      fullPage: true,
    });
    expect(
      await employee.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await customer.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await customerContext.close();
    await employeeContext.close();
  }
});

test('registro y recuperación de la cuenta del propietario conservan PKCE', async ({
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
    page.getByRole('heading', { name: 'Tus tarjetas viven en tu teléfono' }),
  ).toBeVisible();
  const logout = await page.request.post('/api/session', {
    headers: { Origin: origin },
    data: { action: 'logout' },
  });
  expect(logout.ok()).toBeTruthy();
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
  await page.request.post('/api/session', {
    headers: { Origin: origin },
    data: { action: 'logout' },
  });
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
