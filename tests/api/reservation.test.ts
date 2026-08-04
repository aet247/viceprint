import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CancelInput, ReservationDeps, ReservationRecord, ReserveInput } from '../../src/lib/reservation';
import { handleCancel, handleReserve, verifyPayPalCapture } from '../../src/lib/reservation';
import { POST } from '../../src/pages/api/reservation';

const reserveInput: ReserveInput = {
  action: 'reserve',
  tier: 'reserve',
  orderId: 'ORDER-1',
  form: { company: 'Acme Nails', email: 'jane@acme.com', country: 'Germany' },
};

const cancelInput: CancelInput = { action: 'cancel', email: 'jane@acme.com', reference: 'res-ORDER-1' };

function makeDeps(overrides: Partial<ReservationDeps> = {}) {
  const store = new Map<string, string>();
  const put = vi.fn(async (k: string, v: string) => {
    store.set(k, v);
  });
  const get = vi.fn(async (k: string) => store.get(k) ?? null);
  const send = vi.fn().mockResolvedValue({ id: 'mock-email-id' });
  const verify = vi.fn(async () => ({ ok: true, captureId: 'CAP-123', amount: '750.00' }));
  const refund = vi.fn(async () => ({ ok: true }));
  const now = vi.fn(() => '2026-08-04T12:00:00.000Z');
  const base: ReservationDeps = {
    kv: { put, get },
    resend: { emails: { send } },
    env: {
      PAYPAL_CLIENT_ID: 'test-client',
      PAYPAL_SECRET: 'test-secret',
      PAYPAL_ENV: 'sandbox',
      BUSINESS_EMAIL: 'sales@viceprint.pages.dev',
    },
    paypalVerify: verify,
    refund,
    now,
  };
  return { ...base, ...overrides, put, get, send, verify, refund, now, store };
}

function reservedRecord(overrides: Partial<ReservationRecord> = {}): ReservationRecord {
  return {
    id: 'res-ORDER-1',
    tier: 'reserve',
    amount: '750.00',
    company: 'Acme Nails',
    email: 'jane@acme.com',
    country: 'Germany',
    capturedAt: '2026-08-04T12:00:00.000Z',
    balanceDue: 749,
    paypalCaptureId: 'CAP-123',
    status: 'reserved',
    ...overrides,
  };
}

function post(body: unknown, env: Record<string, unknown> = {}): Promise<Response> {
  return Promise.resolve(
    POST({
      request: new Request('http://localhost/api/reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
      locals: { runtime: { env } },
    } as never),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('handleReserve', () => {
  it('writes a KV record and sends two emails on success', async () => {
    const d = makeDeps();
    const res = await handleReserve(reserveInput, d);

    expect(res).toEqual({ ok: true, status: 200, id: 'res-ORDER-1' });
    expect(d.verify).toHaveBeenCalledWith('ORDER-1', expect.anything(), '750.00', { allowUnverified: undefined });
    expect(d.put).toHaveBeenCalledTimes(1);
    const [key, value] = d.put.mock.calls[0] as [string, string];
    expect(key).toBe('res-ORDER-1');
    const record = JSON.parse(value) as ReservationRecord;
    expect(record.tier).toBe('reserve');
    expect(record.amount).toBe('750.00');
    expect(record.balanceDue).toBe(749);
    expect(record.paypalCaptureId).toBe('CAP-123');
    expect(record.status).toBe('reserved');
    expect(record.email).toBe('jane@acme.com');
    expect(record.capturedAt).toBe('2026-08-04T12:00:00.000Z');

    expect(d.send).toHaveBeenCalledTimes(2);
    const customer = d.send.mock.calls[0][0];
    expect(customer.to).toBe('jane@acme.com');
    expect(customer.from).toBe('sales@viceprint.pages.dev');
    expect(customer.subject).toBe('Your VICEPRINT reservation is confirmed');
    expect(customer.html).toContain('Acme Nails');
    expect(customer.html).toContain('res-ORDER-1');
    expect(customer.html).toContain('/legal/withdrawal');
    expect(customer.html).toContain('EUR 749 balance will be invoiced');
    const business = d.send.mock.calls[1][0];
    expect(business.to).toBe('sales@viceprint.pages.dev');
    expect(business.subject).toBe('New VICEPRINT reservation');
    expect(business.html).toContain('Germany');
  });

  it('uses the founder amount and no balance for the founder tier', async () => {
    const d = makeDeps();
    await handleReserve({ ...reserveInput, tier: 'founder' }, d);

    expect(d.verify).toHaveBeenCalledWith('ORDER-1', expect.anything(), '1499.00', { allowUnverified: undefined });
    const record = JSON.parse(d.put.mock.calls[0][1]) as ReservationRecord;
    expect(record.amount).toBe('1499.00');
    expect(record.balanceDue).toBe(0);
    expect(d.send.mock.calls[0][0].html).not.toContain('balance will be invoiced');
  });

  it('rejects a capture whose amount does not match the tier', async () => {
    const d = makeDeps({
      paypalVerify: vi.fn(async () => ({ ok: false, status: 400, error: 'Capture amount mismatch' })),
    });
    const res = await handleReserve(reserveInput, d);

    expect(res).toEqual({ ok: false, status: 400, error: 'Capture amount mismatch' });
    expect(d.put).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it('rejects a capture that is not COMPLETED', async () => {
    const d = makeDeps({
      paypalVerify: vi.fn(async () => ({ ok: false, status: 400, error: 'Capture not verified' })),
    });
    const res = await handleReserve(reserveInput, d);

    expect(res).toEqual({ ok: false, status: 400, error: 'Capture not verified' });
    expect(d.put).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed input with no side effects', async () => {
    const d = makeDeps();
    const res = await handleReserve({ ...reserveInput, orderId: '  ' }, d);

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(res.error).toBe('orderId is required');
    expect(d.verify).not.toHaveBeenCalled();
    expect(d.put).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown tier', async () => {
    const res = await handleReserve({ ...reserveInput, tier: 'gold' }, makeDeps());
    expect(res).toEqual({ ok: false, status: 400, error: 'tier is invalid' });
  });

  it('returns 400 for an invalid email', async () => {
    const res = await handleReserve(
      { ...reserveInput, form: { ...reserveInput.form, email: 'not-an-email' } },
      makeDeps(),
    );
    expect(res).toEqual({ ok: false, status: 400, error: 'email is invalid' });
  });

  it('returns ok in graceful dev mode without credentials, no side effects', async () => {
    const res = await handleReserve(reserveInput, { allowUnverified: true });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.id).toBe('res-ORDER-1');
  });

  it('never skips verification in production (no credentials, not allowed)', async () => {
    const d = makeDeps({ env: {}, allowUnverified: false, paypalVerify: undefined });
    const res = await handleReserve(reserveInput, d);

    expect(res).toEqual({ ok: false, status: 500, error: 'Payment verification unavailable' });
    expect(d.put).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it('escapes user input in email HTML', async () => {
    const d = makeDeps();
    await handleReserve(
      { ...reserveInput, form: { ...reserveInput.form, company: '<script>alert("x")</script>' } },
      d,
    );

    const html = d.send.mock.calls[0][0].html as string;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('verifyPayPalCapture', () => {
  function paypalResponse(payload: unknown): Response {
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const env = { PAYPAL_CLIENT_ID: 'c', PAYPAL_SECRET: 's', PAYPAL_ENV: 'sandbox' };

  it('accepts a COMPLETED capture with the exact tier amount', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      paypalResponse({
        id: 'ORDER-1',
        status: 'COMPLETED',
        purchase_units: [{ payments: { captures: [{ id: 'CAP-123', amount: { value: '750.00', currency_code: 'EUR' } }] } }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await verifyPayPalCapture('ORDER-1', env, '750.00');

    expect(res).toEqual({ ok: true, captureId: 'CAP-123', amount: '750.00' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER-1',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) }) }),
    );
  });

  it('rejects a capture with a mismatched amount', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        paypalResponse({
          id: 'ORDER-1',
          status: 'COMPLETED',
          purchase_units: [{ payments: { captures: [{ id: 'CAP-123', amount: { value: '99.00', currency_code: 'EUR' } }] } }],
        }),
      ),
    );

    const res = await verifyPayPalCapture('ORDER-1', env, '750.00');

    expect(res).toEqual({ ok: false, status: 400, error: 'Capture amount mismatch' });
  });

  it('rejects a capture whose status is not COMPLETED', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        paypalResponse({
          id: 'ORDER-1',
          status: 'APPROVED',
          purchase_units: [{ payments: { captures: [{ id: 'CAP-123', amount: { value: '750.00', currency_code: 'EUR' } }] } }],
        }),
      ),
    );

    const res = await verifyPayPalCapture('ORDER-1', env, '750.00');

    expect(res).toEqual({ ok: false, status: 400, error: 'Capture not verified' });
  });

  it('rejects when the capture is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        paypalResponse({
          id: 'ORDER-1',
          status: 'COMPLETED',
          purchase_units: [{ payments: { captures: [] } }],
        }),
      ),
    );

    const res = await verifyPayPalCapture('ORDER-1', env, '750.00');

    expect(res).toEqual({ ok: false, status: 400, error: 'Capture not verified' });
  });

  it('rejects a non-ok PayPal response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 })));

    const res = await verifyPayPalCapture('ORDER-1', env, '750.00');

    expect(res).toEqual({ ok: false, status: 400, error: 'Capture not verified' });
  });

  it('fails closed without credentials when not allowed', async () => {
    const res = await verifyPayPalCapture('ORDER-1', {}, '750.00');

    expect(res).toEqual({ ok: false, status: 500, error: 'Payment verification unavailable' });
  });

  it('allows unverified in dev mode when credentials are missing', async () => {
    const res = await verifyPayPalCapture('ORDER-1', {}, '750.00', { allowUnverified: true });

    expect(res).toEqual({ ok: true, captureId: 'UNVERIFIED-DEV', amount: '750.00' });
  });
});

describe('handleCancel', () => {
  it('refunds, updates the record to refunded and sends emails', async () => {
    const d = makeDeps();
    d.store.set('res-ORDER-1', JSON.stringify(reservedRecord()));
    const res = await handleCancel(cancelInput, d);

    expect(res).toEqual({ ok: true, status: 200 });
    expect(d.refund).toHaveBeenCalledWith(expect.anything(), 'CAP-123', '750.00');
    expect(d.put).toHaveBeenCalledTimes(1);
    const [key, value] = d.put.mock.calls[0] as [string, string];
    expect(key).toBe('res-ORDER-1');
    const record = JSON.parse(value) as ReservationRecord;
    expect(record.status).toBe('refunded');
    expect(record.refundedAt).toBe('2026-08-04T12:00:00.000Z');
    expect(d.send).toHaveBeenCalledTimes(2);
    expect(d.send.mock.calls[0][0].to).toBe('jane@acme.com');
    expect(d.send.mock.calls[0][0].subject).toBe('Your VICEPRINT reservation has been cancelled');
  });

  it('returns 404 for an unknown reference', async () => {
    const d = makeDeps();
    const res = await handleCancel({ ...cancelInput, reference: 'res-NOPE' }, d);

    expect(res).toEqual({ ok: false, status: 404, error: 'No matching reservation' });
    expect(d.refund).not.toHaveBeenCalled();
    expect(d.put).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it('returns 404 when the email does not match the record', async () => {
    const d = makeDeps();
    d.store.set('res-ORDER-1', JSON.stringify(reservedRecord()));
    const res = await handleCancel({ ...cancelInput, email: 'other@acme.com' }, d);

    expect(res).toEqual({ ok: false, status: 404, error: 'No matching reservation' });
    expect(d.refund).not.toHaveBeenCalled();
  });

  it('returns 409 when the reservation is already refunded', async () => {
    const d = makeDeps();
    d.store.set(
      'res-ORDER-1',
      JSON.stringify(reservedRecord({ status: 'refunded', refundedAt: '2026-08-03T10:00:00.000Z' })),
    );
    const res = await handleCancel(cancelInput, d);

    expect(res).toEqual({ ok: false, status: 409, error: 'Reservation already refunded or cancelled' });
    expect(d.refund).not.toHaveBeenCalled();
    expect(d.put).not.toHaveBeenCalled();
  });

  it('returns 409 when there is no capture to refund (unverified dev record)', async () => {
    const d = makeDeps();
    d.store.set('res-ORDER-1', JSON.stringify(reservedRecord({ paypalCaptureId: 'UNVERIFIED-DEV' })));
    const res = await handleCancel(cancelInput, d);

    expect(res).toEqual({ ok: false, status: 409, error: 'No payment to refund' });
    expect(d.refund).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed cancel input', async () => {
    const d = makeDeps();
    const res = await handleCancel({ ...cancelInput, reference: '  ' }, d);

    expect(res).toEqual({ ok: false, status: 400, error: 'reference is required' });
    expect(d.get).not.toHaveBeenCalled();
  });

  it('returns 503 when no KV store is configured', async () => {
    const d = makeDeps({ kv: undefined });
    const res = await handleCancel(cancelInput, d);

    expect(res).toEqual({ ok: false, status: 503, error: 'Reservation store unavailable' });
  });
});

describe('POST /api/reservation', () => {
  it('returns 400 for malformed JSON', async () => {
    const res = await post('{not json', {});
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'Invalid JSON body' });
  });

  it('returns 400 for an unknown action', async () => {
    const res = await post({ action: 'explode' }, {});
    expect(res.status).toBe(400);
  });

  it('returns 400 for a reserve request missing fields', async () => {
    const res = await post({ action: 'reserve' }, {});
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toBe('tier is invalid');
  });

  it('returns 400 for a cancel request missing fields', async () => {
    const res = await post({ action: 'cancel' }, {});
    expect(res.status).toBe(400);
  });

  it('returns 200 for a valid reserve request through the route (verify + KV, emails skipped without key)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'ORDER-1',
            status: 'COMPLETED',
            purchase_units: [{ payments: { captures: [{ id: 'CAP-123', amount: { value: '750.00', currency_code: 'EUR' } }] } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const puts: string[] = [];
    const kv = {
      get: async () => null,
      put: async (k: string, v: string) => {
        puts.push(`${k}=${v}`);
      },
    };
    const res = await post(
      { action: 'reserve', tier: 'reserve', orderId: 'ORDER-1', form: { company: 'Acme', email: 'jane@acme.com', country: 'DE' } },
      { PAYPAL_CLIENT_ID: 'c', PAYPAL_SECRET: 's', PAYPAL_ENV: 'sandbox', RESERVATIONS: kv },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, id: 'res-ORDER-1' });
    expect(puts).toHaveLength(1);
    expect(puts[0]).toContain('res-ORDER-1=');
    expect(puts[0]).toContain('"status":"reserved"');
  });

  it('returns 500 via the generic error path without leaking internals', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'ORDER-1',
            status: 'COMPLETED',
            purchase_units: [{ payments: { captures: [{ id: 'CAP-123', amount: { value: '750.00', currency_code: 'EUR' } }] } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const res = await post(
      { action: 'reserve', tier: 'reserve', orderId: 'ORDER-1', form: { company: 'Acme', email: 'jane@acme.com', country: 'DE' } },
      { PAYPAL_CLIENT_ID: 'c', PAYPAL_SECRET: 's', RESERVATIONS: { get: async () => null, put: async () => { throw new Error('kv down'); } } },
    );
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'Internal server error' });
  });
});
