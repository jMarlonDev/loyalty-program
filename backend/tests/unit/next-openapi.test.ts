import { describe, expect, it } from 'vitest';
import { nextOpenApiDocument } from '../../src/presentation/http/next-openapi.js';

type JsonObject = Record<string, unknown>;
const paths = () =>
  nextOpenApiDocument.paths as Record<string, Record<string, JsonObject>>;
const schemas = () =>
  (nextOpenApiDocument.components as JsonObject).schemas as Record<
    string,
    JsonObject
  >;

describe('NEXT-001/004 OpenAPI security contracts', () => {
  it('requires owner authority for invitations and binds acceptance to the authenticated email', () => {
    const invite =
      paths()['/api/v1/restaurants/{restaurantId}/invitations']?.post;
    expect(invite?.['x-authorization']).toBe('owner');
    expect(invite?.['x-decision-dependencies']).toContain('D-02');
    expect(schemas().OperatorInvitationInput).toMatchObject({
      required: ['email', 'phone', 'country'],
      additionalProperties: false,
    });
    expect(
      Object.keys(
        (schemas().OperatorInvitationInput?.properties ?? {}) as JsonObject,
      ),
    ).toEqual(['email', 'phone', 'country']);
    expect(schemas().OperatorAcceptanceInput?.required).toEqual(['token']);
    expect(paths()['/api/v1/operator/scans']?.post?.['x-authorization']).toBe(
      'operator',
    );
  });

  it('requires confirmation for reward delivery and denies quantity, card, location and recipient overrides', () => {
    const purchase = schemas().PurchaseInput;
    expect(purchase?.additionalProperties).toBe(false);
    expect(Object.keys((purchase?.properties ?? {}) as JsonObject)).toEqual([
      'restaurant_id',
      'token',
      'sale_reference',
      'location_id',
    ]);
    // D-06: la referencia de ticket es opcional.
    expect(purchase?.required).toEqual(['restaurant_id', 'token']);
    expect(
      (schemas().RedemptionInput?.properties as JsonObject)?.confirm,
    ).toEqual({ type: 'boolean', const: true });
    expect((schemas().VoucherView?.properties as JsonObject)?.purpose).toEqual({
      type: 'string',
      const: 'reward',
    });
    expect(
      Object.keys(
        (schemas().OperatorResendInput?.properties ?? {}) as JsonObject,
      ),
    ).toEqual(['restaurant_id']);
    expect(
      paths()['/api/v1/operator/redemptions']?.post?.['x-authorization'],
    ).toBe('operator');
  });

  it('separates the customer cookie from staff authentication and mounts the new routes', () => {
    const components = nextOpenApiDocument.components as JsonObject;
    expect(
      (components.securitySchemes as JsonObject).customerSession,
    ).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: '__Host-loyalty_customer',
    });
    for (const path of [
      '/api/v1/customer/session',
      '/api/v1/customer/cards',
      '/api/v1/customer/cards/{cardId}/close',
      '/api/v1/customer/cards/{cardId}',
      '/api/v1/customer/cards/{cardId}/qr',
      '/api/v1/customer/rewards/{rewardId}/voucher',
      '/api/v1/customer/events',
    ]) {
      expect(paths()[path], path).toBeDefined();
      for (const operation of Object.values(paths()[path] ?? {})) {
        expect(operation.security, path).toEqual([{ customerSession: [] }]);
        expect(operation['x-implementation'], path).toBe('mounted');
      }
    }
    // NEXT-006: alta y transferencia admiten dispositivo sin sesión o con ella.
    for (const path of [
      '/api/v1/customer/enrollments',
      '/api/v1/customer/transfers/claim',
    ])
      expect(paths()[path]?.post?.security, path).toEqual([
        {},
        { customerSession: [] },
      ]);
    // NEXT-006: el teléfono ya no abre sesiones ni existe «cerrar sesión».
    expect(paths()['/api/v1/customer/session']?.post).toBeUndefined();
    expect(paths()['/api/v1/customer/session']?.delete).toBeUndefined();
    expect(paths()['/api/v1/customer/challenges']).toBeUndefined();
    expect(paths()['/api/v1/customer/challenges/verify']).toBeUndefined();
    expect(
      paths()['/api/v1/customer/cards/{cardId}/qr/rotate'],
    ).toBeUndefined();
  });

  it('requires CSRF origin on every mutation and on the websocket upgrade', () => {
    for (const [path, method] of [
      ['/api/v1/customer/enrollments', 'post'],
      ['/api/v1/customer/cards/{cardId}/close', 'post'],
      ['/api/v1/customer/transfers/claim', 'post'],
      ['/api/v1/restaurants/{restaurantId}/cards/{cardId}/transfers', 'post'],
      ['/api/v1/customer/rewards/{rewardId}/voucher/reissue', 'post'],
      ['/api/v1/operator/purchases', 'post'],
      ['/api/v1/operator/redemptions', 'post'],
      ['/api/v1/restaurants/{restaurantId}/invitations', 'post'],
    ] as const) {
      expect(paths()[path]?.[method]?.parameters, path).toContainEqual(
        expect.objectContaining({
          name: 'Origin',
          in: 'header',
          required: true,
        }),
      );
    }
    expect(paths()['/api/v1/customer/events']?.get?.parameters).toContainEqual(
      expect.objectContaining({ name: 'Origin', in: 'header', required: true }),
    );
    expect(
      paths()['/api/v1/customer/events']?.get?.['x-websocket'],
    ).toBeDefined();
  });

  it('excludes identity and balance overrides from customer requests', () => {
    const all = schemas();
    const expected = {
      CustomerEnrollmentInput: ['public_code', 'phone', 'country'],
      CardCloseInput: ['confirm'],
      TransferClaimInput: ['token'],
      Empty: [],
    };
    for (const [name, properties] of Object.entries(expected)) {
      expect(all[name]?.additionalProperties, name).toBe(false);
      expect(
        Object.keys((all[name]?.properties ?? {}) as JsonObject),
        name,
      ).toEqual(properties);
    }
    expect((schemas().CustomerEnrollmentInput as JsonObject).required).toEqual([
      'public_code',
    ]);
    expect((all.CardQr?.properties as JsonObject)?.purpose).toEqual({
      type: 'string',
      const: 'card',
    });
    expect((all.CardEvent?.properties as JsonObject)?.type).toMatchObject({
      enum: [
        'purchase.recorded',
        'reward.available',
        'reward.redeemed',
        'card.changed',
      ],
    });
    expect(
      Object.keys((all.CardEvent?.properties ?? {}) as JsonObject).sort(),
    ).toEqual(['card_id', 'event_id', 'type', 'version']);
  });

  it('documents enrollment outcomes and reusable schemas without unresolved references', () => {
    const enrollment = paths()['/api/v1/customer/enrollments']?.post
      ?.responses as JsonObject;
    for (const code of ['200', '201', '400', '403', '409', '429', '503'])
      expect(enrollment?.[code]).toBeDefined();
    const traverse = (value: unknown) => {
      if (value === null || typeof value !== 'object') return;
      for (const [name, entry] of Object.entries(value)) {
        if (name === '$ref') {
          let current: unknown = nextOpenApiDocument;
          for (const part of String(entry).split('/').slice(1))
            current = (current as JsonObject)?.[part];
          expect(current, String(entry)).toBeDefined();
        } else traverse(entry);
      }
    };
    traverse(nextOpenApiDocument);
  });
});
