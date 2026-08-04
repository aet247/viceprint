import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import type { ContactDeps, ContactInput } from '@/lib/contact';
import { handleContact } from '@/lib/contact';

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

  let input: ContactInput;
  try {
    const body = (await request.json()) as Record<string, unknown> | null;
    input = {
      company: typeof body?.company === 'string' ? body.company : '',
      name: typeof body?.name === 'string' ? body.name : '',
      email: typeof body?.email === 'string' ? body.email : '',
      country: typeof body?.country === 'string' ? body.country : '',
      message: typeof body?.message === 'string' ? body.message : '',
      wholesale: body?.wholesale === true,
    };
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const deps: ContactDeps = {
    kv: rawEnv.LEADS as ContactDeps['kv'],
    resend:
      typeof rawEnv.RESEND_API_KEY === 'string' && rawEnv.RESEND_API_KEY
        ? new Resend(rawEnv.RESEND_API_KEY)
        : undefined,
    fromEmail: typeof rawEnv.BUSINESS_EMAIL === 'string' ? rawEnv.BUSINESS_EMAIL : undefined,
  };

  const result = await handleContact(input, deps);
  return json(result.ok ? { ok: true } : { ok: false, error: result.error }, result.status);
};
