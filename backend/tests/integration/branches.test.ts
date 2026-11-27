import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { AppError } from '../../src/application/errors.js';
import { LocalAuthStore } from '../../src/infrastructure/local-auth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/database.js';

const ORIGIN = 'https://loyalty.test';

describe('BRANCH-001 sucursales, empleados e invitaciones con PostgreSQL real', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let offsetMs = 0;
  const publicCode = `br-${randomUUID().slice(0, 18)}`;
  const owner = randomUUID();
  const stranger = randomUUID();
  const centroStaff = randomUUID();
  const noBranchStaff = randomUUID();
  const restaurant = randomUUID();
  const people = new Map<string, string>();
  let centro = '';
  let norte = '';
  let customerCounter = 0;

  const person = async (id: string, email: string) => {
    people.set(id, email);
    await database.pool.query(
      "INSERT INTO users(id,full_name,email,status,created_at,updated_at) VALUES($1,'Persona',$2,'active',now(),now())",
      [id, email],
    );
  };
  const request = (
    method: string,
    path: string,
    options: {
      actor?: string;
      customer?: string;
      body?: unknown;
      key?: string;
      origin?: string;
    } = {},
  ) =>
    app.request(`/api/v1${path}`, {
      method,
      headers: {
        ...(options.actor ? { Authorization: `Bearer ${options.actor}` } : {}),
        ...(options.customer ? { 'x-customer-session': options.customer } : {}),
        ...(options.body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(options.key ? { 'Idempotency-Key': options.key } : {}),
        Origin: options.origin ?? ORIGIN,
      },
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    });
  const count = async (sql: string) =>
    Number((await database.pool.query(sql)).rows[0].count);
  const newCard = async () => {
    const phone = `300${String(7000000 + ++customerCounter)}`;
    const enrolled = await request('POST', '/customer/enrollments', {
      body: { phone, country: 'CO', public_code: publicCode },
    });
    expect(enrolled.status).toBe(201);
    const customer = enrolled.headers.get('x-customer-token') ?? '';
    const cardId = (await enrolled.json()).data.card.id as string;
    const qr = await request('GET', `/customer/cards/${cardId}/qr`, {
      customer,
    });
    return { cardId, token: (await qr.json()).data.token as string };
  };
  const buy = (
    actor: string,
    token: string,
    reference: string,
    locationId?: string,
  ) =>
    request('POST', '/operator/purchases', {
      actor,
      key: `k-${reference}`,
      body: {
        restaurant_id: restaurant,
        token,
        sale_reference: reference,
        ...(locationId ? { location_id: locationId } : {}),
      },
    });
  const invite = async (
    locationId: string,
    body: Record<string, unknown> = {},
  ) => {
    const response = await request(
      'POST',
      `/restaurants/${restaurant}/branches/${locationId}/invitations`,
      { actor: owner, body },
    );
    expect(response.status).toBe(201);
    return (await response.json()).data as {
      id: string;
      token: string;
      url: string;
    };
  };
  const accept = async (token: string) => {
    const id = randomUUID();
    await person(id, `staff-${id}@example.test`);
    return {
      id,
      response: await request('POST', '/staff-invitations/accept', {
        actor: id,
        body: { token },
      }),
    };
  };

  beforeAll(async () => {
    database = await createTestDatabase();
    await person(owner, 'owner-br@example.test');
    await person(stranger, 'stranger-br@example.test');
    await person(centroStaff, 'centro-br@example.test');
    await person(noBranchStaff, 'sin-sucursal@example.test');
    await database.pool.query(
      "INSERT INTO restaurants(id,name,owner_user_id,status,created_at,updated_at) VALUES($1,'Sucursales',$2,'active',now(),now())",
      [restaurant, owner],
    );
    await database.pool.query(
      "INSERT INTO roles(id,rol_type,created_at) VALUES($1,'employee',now())",
      [randomUUID()],
    );
    centro = randomUUID();
    norte = randomUUID();
    for (const [id, name] of [
      [centro, 'Centro'],
      [norte, 'Norte'],
    ])
      await database.pool.query(
        "INSERT INTO locations(id,restaurant_id,name,address,city,department,status,created_at,updated_at) VALUES($1,$2,$3,'Dirección','','','active',now() + ($4 || ' milliseconds')::interval,now())",
        [id, restaurant, name, name === 'Centro' ? '0' : '10'],
      );
    await database.pool.query(
      `INSERT INTO loyalty_programs(id,restaurant_id,name,public_code,stamps_required,reward_description,status,created_at,updated_at)
       VALUES($1,$2,'Branch',$3,5,'Premio','active',now(),now())`,
      [randomUUID(), restaurant, publicCode],
    );
    app = createApp({
      pool: database.pool,
      cardTokenEncryptionKey: 'ab'.repeat(32),
      publicOrigin: ORIGIN,
      now: () => new Date(Date.now() + offsetMs),
      identityProvider: {
        async verifyAccessToken(token) {
          const email = people.get(token);
          if (!email) throw new AppError(401, 'UNAUTHENTICATED', 'Invalid');
          return { id: token, email, emailVerified: true };
        },
      },
    });
  });
  afterAll(async () => {
    await database?.cleanup();
  });

  it('solo el dueño crea sucursales y quedan listadas', async () => {
    const body = {
      name: 'Sur',
      address: 'Calle 1 #2-3',
      physical_point: 'Mesa 4',
    };
    const before = await count('SELECT count(*) FROM locations');
    for (const actor of [stranger, centroStaff]) {
      const denied = await request(
        'POST',
        `/restaurants/${restaurant}/branches`,
        { actor, body },
      );
      expect(denied.status).toBe(403);
    }
    expect(await count('SELECT count(*) FROM locations')).toBe(before);
    const created = await request(
      'POST',
      `/restaurants/${restaurant}/branches`,
      { actor: owner, body },
    );
    expect(created.status).toBe(201);
    const list = await request('GET', `/restaurants/${restaurant}/branches`, {
      actor: owner,
    });
    expect(
      (await list.json()).data.map((row: { name: string }) => row.name),
    ).toEqual(expect.arrayContaining(['Centro', 'Norte', 'Sur']));
    expect(
      (
        await request('GET', `/restaurants/${restaurant}/branches`, {
          actor: stranger,
        })
      ).status,
    ).toBe(403);
  });

  it('un no dueño no puede crear invitaciones ni dar de alta empleados', async () => {
    const before = await count('SELECT count(*) FROM branch_invitations');
    for (const actor of [stranger, centroStaff]) {
      expect(
        (
          await request(
            'POST',
            `/restaurants/${restaurant}/branches/${centro}/invitations`,
            { actor, body: {} },
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await request('POST', `/restaurants/${restaurant}/staff`, {
            actor,
            body: {
              email: 'x@example.test',
              full_name: 'X',
              location_ids: [centro],
            },
          })
        ).status,
      ).toBe(403);
    }
    expect(await count('SELECT count(*) FROM branch_invitations')).toBe(before);
  });

  it('alta manual devuelve la contraseña temporal una vez y exige cambiarla', async () => {
    const response = await request('POST', `/restaurants/${restaurant}/staff`, {
      actor: owner,
      body: {
        email: 'Manual@Example.test',
        full_name: 'Manuel',
        location_ids: [centro],
      },
    });
    expect(response.status).toBe(201);
    const data = (await response.json()).data;
    expect(data.email).toBe('manual@example.test');
    expect(data.temporary_password).toMatch(/^[A-Za-z0-9]{12}$/);
    const user = (
      await database.pool.query(
        'SELECT must_change_password,password_hash FROM users WHERE lower(email)=$1',
        ['manual@example.test'],
      )
    ).rows[0];
    expect(user.must_change_password).toBe(true);
    expect(user.password_hash).not.toContain(data.temporary_password);
    const session = await new LocalAuthStore(database.pool).login(
      'manual@example.test',
      data.temporary_password,
    );
    expect(session.user.must_change_password).toBe(true);
    expect(
      await count(
        `SELECT count(*) FROM employee_locations WHERE employee_id='${data.employee_id}' AND location_id='${centro}'`,
      ),
    ).toBe(1);
    // La lista de empleados no vuelve a mostrar la contraseña.
    const list = await request('GET', `/restaurants/${restaurant}/staff`, {
      actor: owner,
    });
    expect(JSON.stringify(await list.json())).not.toContain(
      data.temporary_password,
    );
  });

  it('alta manual de una cuenta existente la vincula sin cambiar su contraseña', async () => {
    const before = (
      await database.pool.query('SELECT password_hash FROM users WHERE id=$1', [
        noBranchStaff,
      ])
    ).rows[0].password_hash;
    const response = await request('POST', `/restaurants/${restaurant}/staff`, {
      actor: owner,
      body: {
        email: 'sin-sucursal@example.test',
        full_name: 'Otro',
        location_ids: [norte],
        password: 'OtraClave123',
      },
    });
    expect(response.status).toBe(201);
    expect((await response.json()).data.temporary_password).toBeNull();
    expect(
      (
        await database.pool.query(
          'SELECT password_hash FROM users WHERE id=$1',
          [noBranchStaff],
        )
      ).rows[0].password_hash,
    ).toBe(before);
  });

  it('una invitación de 24 h y 3 usos la aceptan tres cuentas y la cuarta recibe INVITATION_EXHAUSTED', async () => {
    const invitation = await invite(centro, {
      expires_in_hours: 24,
      max_uses: 3,
    });
    expect(invitation.url).toBe(
      `${ORIGIN}/join-staff#token=${invitation.token}`,
    );
    const first = await accept(invitation.token);
    expect(first.response.status).toBe(201);
    // La misma cuenta que repite no consume otro uso.
    const again = await request('POST', '/staff-invitations/accept', {
      actor: first.id,
      body: { token: invitation.token },
    });
    expect(again.status).toBe(201);
    expect((await accept(invitation.token)).response.status).toBe(201);
    expect((await accept(invitation.token)).response.status).toBe(201);
    const fourth = await accept(invitation.token);
    expect(fourth.response.status).toBe(409);
    expect((await fourth.response.json()).error.code).toBe(
      'INVITATION_EXHAUSTED',
    );
    expect(
      await count(
        `SELECT uses AS count FROM branch_invitations WHERE id='${invitation.id}'`,
      ),
    ).toBe(3);
    expect(
      await count(
        `SELECT count(*) FROM restaurant_employees WHERE user_id='${fourth.id}'`,
      ),
    ).toBe(0);
  });

  it('una invitación vencida responde «Invitación vencida.» sin vincular', async () => {
    const invitation = await invite(centro, { expires_in_hours: 24 });
    offsetMs = 25 * 60 * 60 * 1000;
    try {
      const preview = await request('POST', '/staff-invitations/preview', {
        body: { token: invitation.token },
      });
      expect(preview.status).toBe(409);
      const error = (await preview.json()).error;
      expect(error.code).toBe('INVITATION_EXPIRED');
      expect(error.message).toBe('Invitación vencida.');
      const late = await accept(invitation.token);
      expect(late.response.status).toBe(409);
      expect(
        await count(
          `SELECT count(*) FROM restaurant_employees WHERE user_id='${late.id}'`,
        ),
      ).toBe(0);
    } finally {
      offsetMs = 0;
    }
  });

  it('renovar revoca el token anterior y el nuevo funciona; la vista previa es pública', async () => {
    const invitation = await invite(norte, { max_uses: 2 });
    const renewed = await request(
      'POST',
      `/restaurants/${restaurant}/branch-invitations/${invitation.id}/renew`,
      { actor: owner },
    );
    expect(renewed.status).toBe(201);
    const fresh = (await renewed.json()).data;
    expect(fresh.token).not.toBe(invitation.token);
    expect(fresh.max_uses).toBe(2);
    const old = await request('POST', '/staff-invitations/preview', {
      body: { token: invitation.token },
    });
    expect(old.status).toBe(409);
    expect((await old.json()).error.code).toBe('INVITATION_REVOKED');
    expect((await accept(invitation.token)).response.status).toBe(409);
    // Sin sesión ni cuenta: solo Origin.
    const preview = await request('POST', '/staff-invitations/preview', {
      body: { token: fresh.token },
    });
    expect(preview.status).toBe(200);
    expect((await preview.json()).data).toMatchObject({
      restaurant_name: 'Sucursales',
      location_name: 'Norte',
    });
    expect(
      (
        await request('POST', '/staff-invitations/preview', {
          body: { token: fresh.token },
          origin: 'https://evil.test',
        })
      ).status,
    ).toBe(403);
    expect((await accept(fresh.token)).response.status).toBe(201);
  });

  it('el empleado de Centro compra en Centro, no en Norte, y sin sucursal es rechazado', async () => {
    await database.pool.query(
      `INSERT INTO restaurant_employees(id,user_id,restaurant_id,role_id,status,joined_at,created_at,updated_at)
       SELECT gen_random_uuid(),$1,$2,(SELECT id FROM roles WHERE rol_type='employee' LIMIT 1),'active',now(),now(),now()
       WHERE NOT EXISTS (SELECT 1 FROM restaurant_employees WHERE user_id=$1 AND restaurant_id=$2)`,
      [centroStaff, restaurant],
    );
    await database.pool.query(
      `INSERT INTO employee_locations(employee_id,location_id,created_at)
       SELECT id,$3,now() FROM restaurant_employees WHERE user_id=$1 AND restaurant_id=$2`,
      [centroStaff, restaurant, centro],
    );
    await database.pool.query(
      `INSERT INTO restaurant_employees(id,user_id,restaurant_id,role_id,status,joined_at,created_at,updated_at)
       SELECT gen_random_uuid(),$1,$2,(SELECT id FROM roles WHERE rol_type='employee' LIMIT 1),'active',now(),now(),now()
       WHERE NOT EXISTS (SELECT 1 FROM restaurant_employees WHERE user_id=$1 AND restaurant_id=$2)`,
      [noBranchStaff, restaurant],
    );
    await database.pool.query(
      'DELETE FROM employee_locations WHERE employee_id IN (SELECT id FROM restaurant_employees WHERE user_id=$1)',
      [noBranchStaff],
    );
    const { cardId, token } = await newCard();
    const movements = () =>
      count(
        `SELECT count(*) FROM purchases p JOIN loyalty_cards c ON c.membership_id=p.membership_id WHERE c.id='${cardId}'`,
      );
    const scan = await request('POST', '/operator/scans', {
      actor: centroStaff,
      body: { restaurant_id: restaurant, purpose: 'card', token },
    });
    expect(scan.status).toBe(200);
    expect(
      (await scan.json()).data.locations.map((row: { id: string }) => row.id),
    ).toEqual([centro]);

    const wrong = await buy(centroStaff, token, 'NORTE-1', norte);
    expect(wrong.status).toBe(403);
    expect((await wrong.json()).error.code).toBe('LOCATION_FORBIDDEN');
    expect(await movements()).toBe(0);

    const ok = await buy(centroStaff, token, 'CENTRO-1', centro);
    expect(ok.status).toBe(201);
    expect(await movements()).toBe(1);
    expect(
      await count(
        `SELECT count(*) FROM purchases WHERE sale_reference='CENTRO-1' AND location_id='${centro}'`,
      ),
    ).toBe(1);

    const none = await buy(noBranchStaff, token, 'NONE-1');
    expect(none.status).toBe(403);
    expect((await none.json()).error.code).toBe('NO_LOCATION');
    expect(await movements()).toBe(1);

    const outsider = await buy(stranger, token, 'OUT-1', centro);
    expect(outsider.status).toBe(403);
    expect(await movements()).toBe(1);
  });
});
