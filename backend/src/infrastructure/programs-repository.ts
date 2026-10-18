import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { AppError } from '../application/errors.js';
import type {
  EnrollmentResult,
  ProgramPage,
  ProgramRecord,
  ProgramRepository,
} from '../application/programs.js';
import type { PageInput, ProgramInput } from '../domain/programs.js';
import { requireStaff } from './staff-access.js';
import { createTokenCodec } from './token-codec.js';
import {
  idempotent,
  lockActor,
  lockRestaurant,
  withTransaction,
} from './transactions.js';

const notFound = () => new AppError(404, 'NOT_FOUND', 'No existe el recurso.');
const conflict = (message: string) => new AppError(409, 'CONFLICT', message);
const cardSelect = `SELECT c.id,c.membership_id,c.status,c.created_at,m.user_id,m.program_id,
 m.status AS membership_status,p.restaurant_id,p.name AS program_name,
 COALESCE((SELECT sum(stamp_delta) FROM loyalty_ledger_entries WHERE membership_id=m.id),0)::int AS balance
 FROM loyalty_cards c JOIN memberships m ON m.id=c.membership_id JOIN loyalty_programs p ON p.id=m.program_id`;
function pageResult(rows: ProgramRecord[], page: PageInput): ProgramPage {
  const data = rows.slice(0, page.limit);
  return {
    data,
    next_cursor: rows.length > page.limit ? String(data.at(-1)?.id) : null,
  };
}
function activeRestaurant(status: string) {
  if (status !== 'active') throw conflict('El restaurante está suspendido.');
}

export class PgProgramRepository implements ProgramRepository {
  private readonly codec;
  private readonly now;
  constructor(
    private readonly pool: Pool,
    options: { tokenEncryptionKey: string; now?: () => Date },
  ) {
    this.codec = createTokenCodec(options.tokenEncryptionKey);
    this.now = options.now ?? (() => new Date());
  }
  private async audit(
    client: PoolClient,
    actor: string,
    restaurant: string,
    action: string,
    resourceId: string,
    requestId: string,
  ) {
    await client.query(
      'INSERT INTO audit_events(id,actor_id,restaurant_id,action,resource_id,request_id,details,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        randomUUID(),
        actor,
        restaurant,
        action,
        resourceId,
        requestId,
        {},
        this.now(),
      ],
    );
  }
  private async staff(
    client: PoolClient,
    actor: string,
    restaurant: string,
    all = false,
  ) {
    await lockRestaurant(client, restaurant);
    await lockActor(client, actor);
    return requireStaff(
      client,
      actor,
      restaurant,
      all ? ['owner', 'admin', 'employee'] : ['owner', 'admin'],
    );
  }
  private async program(client: PoolClient, restaurant: string, id: string) {
    const row = (
      await client.query(
        'SELECT * FROM loyalty_programs WHERE id=$1 AND restaurant_id=$2 FOR UPDATE',
        [id, restaurant],
      )
    ).rows[0];
    if (!row) throw notFound();
    return row as ProgramRecord;
  }
  async create(
    actor: string,
    restaurant: string,
    input: ProgramInput,
    key: string,
    requestId: string = randomUUID(),
  ): Promise<ProgramRecord> {
    return withTransaction(this.pool, async (client) => {
      await this.staff(client, actor, restaurant);
      return idempotent(
        client,
        {
          actorId: actor,
          key,
          operation: 'program.create',
          payload: { restaurant, input },
        },
        async () => {
          const result = await client.query(
            `INSERT INTO loyalty_programs(id,restaurant_id,name,description,public_code,stamps_required,reward_description,status,created_at,updated_at,terms_locked,logo_url,background_color,text_color,card_message)
     VALUES($1,$2,$3,$4,$5,$6,$7,'active',$8,$8,false,$9,$10,$11,$12) RETURNING *`,
            [
              randomUUID(),
              restaurant,
              input.name,
              input.description ?? null,
              this.codec.generate(),
              input.stamps_required,
              input.reward_description,
              this.now(),
              input.logo_url ?? null,
              input.background_color ?? '#FFFFFF',
              input.text_color ?? '#000000',
              input.card_message ?? null,
            ],
          );
          await this.audit(
            client,
            actor,
            restaurant,
            'program.create',
            result.rows[0].id,
            requestId,
          );
          return result.rows[0];
        },
      );
    });
  }
  async list(
    actor: string,
    restaurant: string,
    page: PageInput,
  ): Promise<ProgramPage> {
    return withTransaction(this.pool, async (client) => {
      await this.staff(client, actor, restaurant);
      const result = await client.query(
        'SELECT * FROM loyalty_programs WHERE restaurant_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3',
        [restaurant, page.cursor, page.limit + 1],
      );
      return pageResult(result.rows, page);
    });
  }
  async get(
    actor: string,
    restaurant: string,
    program: string,
  ): Promise<ProgramRecord> {
    return withTransaction(this.pool, async (client) => {
      await this.staff(client, actor, restaurant);
      return this.program(client, restaurant, program);
    });
  }
  async update(
    actor: string,
    restaurant: string,
    program: string,
    input: ProgramInput,
    key: string,
    requestId: string = randomUUID(),
  ): Promise<ProgramRecord> {
    return withTransaction(this.pool, async (client) => {
      await this.staff(client, actor, restaurant);
      const current = await this.program(client, restaurant, program);
      if (
        current.status === 'ended' &&
        input.status &&
        input.status !== 'ended'
      )
        throw conflict('Un programa finalizado no puede reactivarse.');
      if (
        current.terms_locked &&
        ((input.stamps_required !== undefined &&
          input.stamps_required !== current.stamps_required) ||
          (input.reward_description !== undefined &&
            input.reward_description !== current.reward_description))
      )
        throw conflict(
          'La meta y el premio están fijados desde la primera inscripción.',
        );
      return idempotent(
        client,
        {
          actorId: actor,
          key,
          operation: 'program.update',
          payload: { restaurant, program, input },
        },
        async () => {
          const allowed = [
            'name',
            'description',
            'stamps_required',
            'reward_description',
            'logo_url',
            'background_color',
            'text_color',
            'card_message',
            'status',
          ];
          const entries = Object.entries(input).filter(([name]) =>
            allowed.includes(name),
          );
          const values: unknown[] = entries.map(([, value]) => value);
          values.push(this.now(), program, restaurant);
          const assignments = entries.map(
            ([name], index) => `${name}=$${index + 1}`,
          );
          assignments.push(`updated_at=$${entries.length + 1}`);
          const updated = (
            await client.query(
              `UPDATE loyalty_programs SET ${assignments.join(',')} WHERE id=$${entries.length + 2} AND restaurant_id=$${entries.length + 3} RETURNING *`,
              values,
            )
          ).rows[0];
          await this.audit(
            client,
            actor,
            restaurant,
            'program.update',
            program,
            requestId,
          );
          return updated;
        },
      );
    });
  }
  async publicByCode(code: string): Promise<ProgramRecord> {
    const row = (
      await this.pool.query(
        `SELECT p.id,p.public_code,p.name,p.description,p.stamps_required,p.reward_description,p.logo_url,p.background_color,p.text_color,p.card_message,r.name AS restaurant_name
   FROM loyalty_programs p JOIN restaurants r ON r.id=p.restaurant_id WHERE p.public_code=$1 AND p.status='active' AND r.status='active'`,
        [code],
      )
    ).rows[0];
    if (!row) throw notFound();
    return row;
  }
  async enroll(
    actor: string,
    code: string,
    key: string,
    requestId: string = randomUUID(),
  ): Promise<EnrollmentResult> {
    return withTransaction(this.pool, async (client) => {
      const lookup = (
        await client.query(
          'SELECT id,restaurant_id FROM loyalty_programs WHERE public_code=$1',
          [code],
        )
      ).rows[0];
      if (!lookup) throw notFound();
      const restaurant = await lockRestaurant(client, lookup.restaurant_id);
      await lockActor(client, actor);
      activeRestaurant(restaurant.status);
      const program = await this.program(
        client,
        lookup.restaurant_id,
        lookup.id,
      );
      if (program.status !== 'active')
        throw conflict('El programa no permite inscripciones.');
      const current = (
        await client.query(
          "SELECT * FROM memberships WHERE user_id=$1 AND program_id=$2 AND status<>'closed' FOR UPDATE",
          [actor, program.id],
        )
      ).rows[0];
      if (current && current.status !== 'active')
        throw conflict('La membresía no está activa.');
      return idempotent(
        client,
        { actorId: actor, key, operation: 'program.enroll', payload: { code } },
        async () => {
          if (current) {
            const card = (
              await client.query(
                'SELECT id,membership_id,status,created_at FROM loyalty_cards WHERE membership_id=$1',
                [current.id],
              )
            ).rows[0];
            if (!card) throw conflict('La membresía no tiene tarjeta.');
            await this.audit(
              client,
              actor,
              String(program.restaurant_id),
              'program.enroll',
              current.id,
              requestId,
            );
            return { created: false, membership: current, card };
          }
          const date = this.now(),
            membershipId = randomUUID(),
            cardId = randomUUID(),
            token = this.codec.generate();
          const membership = (
            await client.query(
              "INSERT INTO memberships(id,user_id,program_id,status,joined_at) VALUES($1,$2,$3,'active',$4) RETURNING *",
              [membershipId, actor, program.id, date],
            )
          ).rows[0];
          const card = (
            await client.query(
              "INSERT INTO loyalty_cards(id,membership_id,qr_token_hash,qr_token_encrypted,status,created_at) VALUES($1,$2,$3,$4,'active',$5) RETURNING id,membership_id,status,created_at",
              [
                cardId,
                membershipId,
                this.codec.hash(token),
                this.codec.encrypt(token),
                date,
              ],
            )
          ).rows[0];
          await client.query(
            'UPDATE loyalty_programs SET terms_locked=true,updated_at=$2 WHERE id=$1',
            [program.id, date],
          );
          await this.audit(
            client,
            actor,
            String(program.restaurant_id),
            'program.enroll',
            membershipId,
            requestId,
          );
          return { created: true, membership, card };
        },
      );
    });
  }
  private async ownCard(
    client: PoolClient,
    actor: string,
    card: string,
    requireActive = false,
  ) {
    const lookup = (
      await client.query(`${cardSelect} WHERE c.id=$1 AND m.user_id=$2`, [
        card,
        actor,
      ])
    ).rows[0];
    if (!lookup) throw notFound();
    const restaurant = await lockRestaurant(client, lookup.restaurant_id);
    await lockActor(client, actor);
    const row = (
      await client.query(
        `${cardSelect} WHERE c.id=$1 AND m.user_id=$2 FOR UPDATE OF c,m`,
        [card, actor],
      )
    ).rows[0];
    if (!row) throw notFound();
    if (requireActive) {
      activeRestaurant(restaurant.status);
      if (row.status !== 'active' || row.membership_status !== 'active')
        throw conflict('La tarjeta no está activa.');
    }
    return row as ProgramRecord;
  }
  async listCards(actor: string, page: PageInput): Promise<ProgramPage> {
    return withTransaction(this.pool, async (client) => {
      await lockActor(client, actor);
      const result = await client.query(
        `${cardSelect} WHERE m.user_id=$1 AND ($2::uuid IS NULL OR c.id>$2) ORDER BY c.id LIMIT $3`,
        [actor, page.cursor, page.limit + 1],
      );
      return pageResult(result.rows, page);
    });
  }
  async cardDetails(actor: string, card: string): Promise<ProgramRecord> {
    return withTransaction(this.pool, (client) =>
      this.ownCard(client, actor, card),
    );
  }
  async cardHistory(
    actor: string,
    card: string,
    kind: 'movements' | 'rewards',
    page: PageInput,
  ): Promise<ProgramPage> {
    return withTransaction(this.pool, async (client) => {
      const own = await this.ownCard(client, actor, card);
      const table = kind === 'movements' ? 'loyalty_ledger_entries' : 'rewards';
      const result = await client.query(
        `SELECT * FROM ${table} WHERE membership_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`,
        [own.membership_id, page.cursor, page.limit + 1],
      );
      return pageResult(result.rows, page);
    });
  }
  async getQr(
    actor: string,
    card: string,
  ): Promise<{ card_id: string; token: string }> {
    return withTransaction(this.pool, async (client) => {
      await this.ownCard(client, actor, card, true);
      const row = (
        await client.query(
          'SELECT qr_token_encrypted FROM loyalty_cards WHERE id=$1',
          [card],
        )
      ).rows[0];
      if (!row?.qr_token_encrypted)
        throw conflict('La tarjeta requiere rotar su QR.');
      return {
        card_id: card,
        token: this.codec.decrypt(row.qr_token_encrypted),
      };
    });
  }
  async rotateQr(
    actor: string,
    card: string,
    key: string,
    requestId: string = randomUUID(),
  ): Promise<{ card_id: string; token: string }> {
    const result = await withTransaction(this.pool, async (client) => {
      const own = await this.ownCard(client, actor, card, true);
      return idempotent(
        client,
        { actorId: actor, key, operation: 'card.rotate', payload: { card } },
        async () => {
          const token = this.codec.generate(),
            cipher = this.codec.encrypt(token);
          await client.query(
            'UPDATE loyalty_cards SET qr_token_hash=$2,qr_token_encrypted=$3 WHERE id=$1',
            [card, this.codec.hash(token), cipher],
          );
          await this.audit(
            client,
            actor,
            String(own.restaurant_id),
            'card.rotate',
            card,
            requestId,
          );
          return { card_id: card, cipher };
        },
      );
    });
    return {
      card_id: result.card_id,
      token: this.codec.decrypt(result.cipher),
    };
  }
  async resolveCard(
    actor: string,
    restaurant: string,
    token: string,
  ): Promise<ProgramRecord> {
    return withTransaction(this.pool, async (client) => {
      await this.staff(client, actor, restaurant, true);
      const row = (
        await client.query(
          `${cardSelect} WHERE c.qr_token_hash=$1 AND p.restaurant_id=$2 AND c.status='active' AND m.status='active'`,
          [this.codec.hash(token), restaurant],
        )
      ).rows[0];
      if (!row) throw notFound();
      return row;
    });
  }
}
