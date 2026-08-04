export type Tier = 'reserve' | 'founder';

export const TIER_AMOUNTS: Record<Tier, string> = { reserve: '750.00', founder: '1499.00' };
export const TIER_BALANCE_DUE: Record<Tier, number> = { reserve: 749, founder: 0 };
export const TIER_LABELS: Record<Tier, string> = {
  reserve: 'Reserve (50% deposit)',
  founder: 'Founder (full prepay)',
};

const SITE_URL = 'https://viceprint.pages.dev';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMITS = { company: 200, country: 200, orderId: 64, reference: 200 } as const;

export interface ReserveInput {
  action: 'reserve';
  tier: string;
  orderId: string;
  form: { company: string; email: string; country: string };
}

export interface CancelInput {
  action: 'cancel';
  email: string;
  reference: string;
}

export interface KVLike {
  get(key: string): Promise<string | null> | string | null;
  put(key: string, value: string): Promise<unknown> | unknown;
}

export interface ResendLike {
  emails: { send(opts: { from: string; to: string; subject: string; html: string }): Promise<unknown> | unknown };
}

export interface ReservationEnv {
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_SECRET?: string;
  PAYPAL_ENV?: string;
  RESEND_API_KEY?: string;
  BUSINESS_EMAIL?: string;
  RESERVATIONS?: KVLike;
  ALLOW_UNVERIFIED?: string;
}

export interface VerifyResult {
  ok: boolean;
  captureId?: string;
  amount?: string;
  status?: number;
  error?: string;
}

export type PaypalVerify = (
  orderId: string,
  env: ReservationEnv,
  expectedAmount: string,
  opts?: { allowUnverified?: boolean },
) => Promise<VerifyResult>;

export type RefundFn = (env: ReservationEnv, captureId: string, amount: string) => Promise<{ ok: boolean; error?: string }>;

export interface ReservationDeps {
  kv?: KVLike;
  resend?: ResendLike;
  env?: ReservationEnv;
  paypalVerify?: PaypalVerify;
  refund?: RefundFn;
  now?: () => string;
  allowUnverified?: boolean;
}

export interface ReservationRecord {
  id: string;
  tier: Tier;
  amount: string;
  company: string;
  email: string;
  country: string;
  capturedAt: string;
  balanceDue: number;
  paypalCaptureId: string;
  status: 'reserved' | 'refunded';
  refundedAt?: string;
}

export interface ReservationResult {
  ok: boolean;
  status: number;
  error?: string;
  id?: string;
}

type PayPalOrder = {
  status?: string;
  purchase_units?: Array<{
    payments?: { captures?: Array<{ id?: string; amount?: { value?: string; currency_code?: string } }> };
  }>;
};

export function validateReserve(input: ReserveInput): string | null {
  if (input.tier !== 'reserve' && input.tier !== 'founder') return 'tier is invalid';
  if (typeof input.orderId !== 'string' || input.orderId.trim() === '') return 'orderId is required';
  if (input.orderId.trim().length > LIMITS.orderId) return 'orderId is too long';
  if (!input.form || typeof input.form !== 'object') return 'form is required';
  for (const field of ['company', 'country'] as const) {
    const value = input.form[field];
    if (typeof value !== 'string' || value.trim() === '') return `${field} is required`;
    if (value.trim().length > LIMITS[field]) return `${field} is too long`;
  }
  const email = input.form.email;
  if (typeof email !== 'string' || email.trim() === '') return 'email is required';
  if (email.trim().length > 254) return 'email is too long';
  if (!EMAIL_RE.test(email.trim())) return 'email is invalid';
  return null;
}

export function validateCancel(input: CancelInput): string | null {
  const email = input.email;
  if (typeof email !== 'string' || email.trim() === '') return 'email is required';
  if (email.trim().length > 254) return 'email is too long';
  if (!EMAIL_RE.test(email.trim())) return 'email is invalid';
  const reference = input.reference;
  if (typeof reference !== 'string' || reference.trim() === '') return 'reference is required';
  if (reference.trim().length > LIMITS.reference) return 'reference is too long';
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function verifyPayPalCapture(
  orderId: string,
  env: ReservationEnv,
  expectedAmount: string,
  opts: { allowUnverified?: boolean } = {},
): Promise<VerifyResult> {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET) {
    if (opts.allowUnverified) {
      console.log('[reservation] PAYPAL credentials missing — dev mode, capture NOT verified');
      return { ok: true, captureId: 'UNVERIFIED-DEV', amount: expectedAmount };
    }
    return { ok: false, status: 500, error: 'Payment verification unavailable' };
  }
  const base = env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  const auth = 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`);
  let res: Response;
  try {
    res = await fetch(`${base}/v2/checkout/orders/${orderId}`, { headers: { Authorization: auth } });
  } catch {
    return { ok: false, status: 502, error: 'Payment verification failed' };
  }
  if (!res.ok) return { ok: false, status: 400, error: 'Capture not verified' };
  let data: PayPalOrder | null;
  try {
    data = (await res.json()) as PayPalOrder;
  } catch {
    return { ok: false, status: 502, error: 'Payment verification failed' };
  }
  const capture = data?.purchase_units?.[0]?.payments?.captures?.[0];
  if (data?.status !== 'COMPLETED' || !capture) return { ok: false, status: 400, error: 'Capture not verified' };
  if (capture.amount?.value !== expectedAmount || capture.amount.currency_code !== 'EUR') {
    return { ok: false, status: 400, error: 'Capture amount mismatch' };
  }
  return { ok: true, captureId: capture.id, amount: capture.amount.value };
}

export async function refundCapture(env: ReservationEnv, captureId: string, amount: string): Promise<{ ok: boolean; error?: string }> {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET) {
    console.log('[reservation] PAYPAL credentials missing — refund skipped');
    return { ok: false, error: 'PayPal credentials missing' };
  }
  const base = env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  const auth = 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`);
  let res: Response;
  try {
    res = await fetch(`${base}/v2/payments/captures/${captureId}/refund`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: { value: amount, currency_code: 'EUR' } }),
    });
  } catch {
    return { ok: false, error: 'Refund request failed' };
  }
  if (!res.ok) return { ok: false, error: 'Refund request failed' };
  return { ok: true };
}

function customerEmail(record: ReservationRecord): { subject: string; html: string } {
  const balance =
    record.tier === 'reserve'
      ? '<p>Your remaining EUR 749 balance will be invoiced by email once a ship date is confirmed (manual step for v1).</p>'
      : '';
  return {
    subject: 'Your VICEPRINT reservation is confirmed',
    html:
      `<p>Hi ${escapeHtml(record.company)},</p>` +
      `<p>Your VICEPRINT reservation is confirmed.</p>` +
      `<p><strong>Reference:</strong> ${escapeHtml(record.id)}<br>` +
      `<strong>Tier:</strong> ${TIER_LABELS[record.tier]}<br>` +
      `<strong>Amount received:</strong> EUR ${record.amount}</p>` +
      `<p>What happens next: your unit enters production in order of reservation. We will email you with your ` +
      `estimated ship window once a ship date is confirmed.</p>` +
      balance +
      `<p>To cancel before your unit ships, use the withdrawal form with your reservation reference: ` +
      `<a href="${SITE_URL}/legal/withdrawal">Cancel my reservation</a></p>`,
  };
}

function businessEmail(record: ReservationRecord): { subject: string; html: string } {
  return {
    subject: 'New VICEPRINT reservation',
    html:
      `<p>New VICEPRINT reservation</p>` +
      `<p><strong>Reference:</strong> ${escapeHtml(record.id)}<br>` +
      `<strong>Tier:</strong> ${TIER_LABELS[record.tier]}<br>` +
      `<strong>Company:</strong> ${escapeHtml(record.company)}<br>` +
      `<strong>Email:</strong> ${escapeHtml(record.email)}<br>` +
      `<strong>Country:</strong> ${escapeHtml(record.country)}<br>` +
      `<strong>Amount:</strong> EUR ${record.amount}<br>` +
      `<strong>Balance due:</strong> EUR ${record.balanceDue}<br>` +
      `<strong>Captured at:</strong> ${record.capturedAt}</p>`,
  };
}

async function sendReserveEmails(record: ReservationRecord, deps: ReservationDeps): Promise<void> {
  const fromEmail = deps.env?.BUSINESS_EMAIL;
  if (!deps.resend || !fromEmail) {
    console.log('[reservation] RESEND_API_KEY or BUSINESS_EMAIL missing — email send skipped');
    return;
  }
  const customer = customerEmail(record);
  await deps.resend.emails.send({ from: fromEmail, to: record.email, subject: customer.subject, html: customer.html });
  const business = businessEmail(record);
  await deps.resend.emails.send({ from: fromEmail, to: fromEmail, subject: business.subject, html: business.html });
}

async function sendCancelEmails(record: ReservationRecord, deps: ReservationDeps): Promise<void> {
  const fromEmail = deps.env?.BUSINESS_EMAIL;
  if (!deps.resend || !fromEmail) {
    console.log('[reservation] RESEND_API_KEY or BUSINESS_EMAIL missing — cancel email skipped');
    return;
  }
  await deps.resend.emails.send({
    from: fromEmail,
    to: record.email,
    subject: 'Your VICEPRINT reservation has been cancelled',
    html:
      `<p>Hi ${escapeHtml(record.company)},</p>` +
      `<p>Your VICEPRINT reservation <strong>${escapeHtml(record.id)}</strong> has been cancelled and your payment of ` +
      `EUR ${record.amount} is being refunded. The refund appears in your account within a few business days.</p>`,
  });
  await deps.resend.emails.send({
    from: fromEmail,
    to: fromEmail,
    subject: 'VICEPRINT reservation cancelled',
    html:
      `<p>Reservation <strong>${escapeHtml(record.id)}</strong> (${escapeHtml(record.company)}, ` +
      `${escapeHtml(record.email)}) was cancelled — EUR ${record.amount} refunded.</p>`,
  });
}

export async function handleReserve(input: ReserveInput, deps: ReservationDeps): Promise<ReservationResult> {
  const error = validateReserve(input);
  if (error) return { ok: false, status: 400, error };

  const tier = input.tier as Tier;
  const expectedAmount = TIER_AMOUNTS[tier];
  const env = deps.env ?? {};
  const verify = deps.paypalVerify ?? verifyPayPalCapture;
  const verified = await verify(input.orderId, env, expectedAmount, { allowUnverified: deps.allowUnverified });
  if (!verified.ok) return { ok: false, status: verified.status ?? 400, error: verified.error ?? 'Payment verification failed' };

  const now = deps.now ?? (() => new Date().toISOString());
  const id = `res-${input.orderId}`;
  const record: ReservationRecord = {
    id,
    tier,
    amount: expectedAmount,
    company: input.form.company.trim(),
    email: input.form.email.trim(),
    country: input.form.country.trim(),
    capturedAt: now(),
    balanceDue: TIER_BALANCE_DUE[tier],
    paypalCaptureId: verified.captureId ?? '',
    status: 'reserved',
  };

  if (deps.kv) {
    await deps.kv.put(id, JSON.stringify(record));
  } else {
    console.log('[reservation] RESERVATIONS KV not configured — record write skipped', id);
  }

  await sendReserveEmails(record, deps);
  return { ok: true, status: 200, id };
}

export async function handleCancel(input: CancelInput, deps: ReservationDeps): Promise<ReservationResult> {
  const error = validateCancel(input);
  if (error) return { ok: false, status: 400, error };

  if (!deps.kv) {
    console.log('[reservation] RESERVATIONS KV not configured — cancel lookup skipped');
    return { ok: false, status: 503, error: 'Reservation store unavailable' };
  }

  const raw = await deps.kv.get(input.reference.trim());
  if (!raw) return { ok: false, status: 404, error: 'No matching reservation' };

  let record: ReservationRecord;
  try {
    record = JSON.parse(raw) as ReservationRecord;
  } catch {
    return { ok: false, status: 404, error: 'No matching reservation' };
  }
  if (record.email !== input.email.trim()) return { ok: false, status: 404, error: 'No matching reservation' };
  if (record.status !== 'reserved') return { ok: false, status: 409, error: 'Reservation already refunded or cancelled' };
  if (!record.paypalCaptureId || record.paypalCaptureId === 'UNVERIFIED-DEV') {
    return { ok: false, status: 409, error: 'No payment to refund' };
  }

  const refund = deps.refund ?? refundCapture;
  const result = await refund(deps.env ?? {}, record.paypalCaptureId, record.amount);
  if (!result.ok) return { ok: false, status: 502, error: 'Refund failed — please contact us' };

  const now = deps.now ?? (() => new Date().toISOString());
  record.status = 'refunded';
  record.refundedAt = now();
  await deps.kv.put(record.id, JSON.stringify(record));

  await sendCancelEmails(record, deps);
  return { ok: true, status: 200 };
}
