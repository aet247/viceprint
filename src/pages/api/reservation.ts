import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import type { KVLike, ReservationDeps, ReservationEnv } from '@/lib/reservation';
import { handleCancel, handleReserve } from '@/lib/reservation';

export const prerender = false;

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const rawEnv: Record<string, unknown> =
    (locals as { runtime?: { env?: Record<string, unknown> } }).runtime?.env ??
    (import.meta.env as unknown as Record<string, unknown>);

  const body: Record<string, unknown> | null = await request.json().catch(() => null);
  if (!body || typeof body.action !== 'string' || (body.action !== 'reserve' && body.action !== 'cancel')) {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const env: ReservationEnv = {
    PAYPAL_CLIENT_ID: typeof rawEnv.PAYPAL_CLIENT_ID === 'string' ? rawEnv.PAYPAL_CLIENT_ID : undefined,
    PAYPAL_SECRET: typeof rawEnv.PAYPAL_SECRET === 'string' ? rawEnv.PAYPAL_SECRET : undefined,
    PAYPAL_ENV: typeof rawEnv.PAYPAL_ENV === 'string' ? rawEnv.PAYPAL_ENV : undefined,
    RESEND_API_KEY: typeof rawEnv.RESEND_API_KEY === 'string' ? rawEnv.RESEND_API_KEY : undefined,
    BUSINESS_EMAIL: typeof rawEnv.BUSINESS_EMAIL === 'string' ? rawEnv.BUSINESS_EMAIL : undefined,
    ALLOW_UNVERIFIED: typeof rawEnv.ALLOW_UNVERIFIED === 'string' ? rawEnv.ALLOW_UNVERIFIED : undefined,
    RESERVATIONS: rawEnv.RESERVATIONS as KVLike | undefined,
  };

  const deps: ReservationDeps = {
    kv: env.RESERVATIONS,
    resend: typeof env.RESEND_API_KEY === 'string' && env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : undefined,
    env,
    allowUnverified: import.meta.env.DEV || env.ALLOW_UNVERIFIED === 'true',
  };

  try {
    if (body.action === 'reserve') {
      const form = typeof body.form === 'object' && body.form !== null ? (body.form as Record<string, unknown>) : {};
      const result = await handleReserve(
        {
          action: 'reserve',
          tier: typeof body.tier === 'string' ? body.tier : '',
          orderId: typeof body.orderId === 'string' ? body.orderId : '',
          form: {
            company: typeof form.company === 'string' ? form.company : '',
            email: typeof form.email === 'string' ? form.email : '',
            country: typeof form.country === 'string' ? form.country : '',
          },
        },
        deps,
      );
      return json(result.ok ? { ok: true, id: result.id } : { ok: false, error: result.error }, result.status);
    }

    const result = await handleCancel(
      {
        action: 'cancel',
        email: typeof body.email === 'string' ? body.email : '',
        reference: typeof body.reference === 'string' ? body.reference : '',
      },
      deps,
    );
    return json(result.ok ? { ok: true } : { ok: false, error: result.error }, result.status);
  } catch (e) {
    console.error('[reservation] unexpected error', e);
    return json({ ok: false, error: 'Internal server error' }, 500);
  }
};
