export interface ContactInput {
  company: string;
  name: string;
  email: string;
  country: string;
  message: string;
  wholesale?: boolean;
}

export interface ContactDeps {
  kv?: { put(key: string, value: string): Promise<unknown> | unknown };
  resend?: { emails: { send(opts: { from: string; to: string; subject: string; html: string }): Promise<unknown> | unknown } };
  fromEmail?: string;
}

export interface ContactResult {
  ok: boolean;
  status: number;
  error?: string;
}

const LIMITS = { company: 200, name: 200, country: 200, message: 2000 } as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateContact(input: ContactInput): string | null {
  for (const field of ['company', 'name', 'email', 'country', 'message'] as const) {
    const value = input[field];
    if (typeof value !== 'string' || value.trim() === '') return `${field} is required`;
    if (field !== 'email' && value.trim().length > LIMITS[field]) return `${field} is too long`;
  }
  if (input.email.trim().length > 254) return 'email is too long';
  if (!EMAIL_RE.test(input.email.trim())) return 'email is invalid';
  if (input.message.trim().length > LIMITS.message) return 'message is too long';
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

export async function handleContact(input: ContactInput, deps: ContactDeps): Promise<ContactResult> {
  const error = validateContact(input);
  if (error) return { ok: false, status: 400, error };

  const record = {
    company: input.company.trim(),
    name: input.name.trim(),
    email: input.email.trim(),
    country: input.country.trim(),
    message: input.message.trim(),
    wholesale: Boolean(input.wholesale),
    receivedAt: new Date().toISOString(),
  };

  if (deps.kv) {
    await deps.kv.put(`lead-${Date.now()}`, JSON.stringify(record));
  } else {
    console.log('[contact] LEADS KV not configured — lead write skipped', JSON.stringify(record));
  }

  if (deps.resend && deps.fromEmail) {
    const html =
      `<p><strong>Company:</strong> ${escapeHtml(record.company)}</p>` +
      `<p><strong>Contact name:</strong> ${escapeHtml(record.name)}</p>` +
      `<p><strong>Email:</strong> ${escapeHtml(record.email)}</p>` +
      `<p><strong>Country:</strong> ${escapeHtml(record.country)}</p>` +
      `<p><strong>Wholesale interest:</strong> ${record.wholesale ? 'Yes' : 'No'}</p>` +
      `<p><strong>Message:</strong> ${escapeHtml(record.message)}</p>`;
    await deps.resend.emails.send({
      from: deps.fromEmail,
      to: deps.fromEmail,
      subject: 'New Automatic Nail Art Machine lead',
      html,
    });
  } else {
    console.log('[contact] RESEND_API_KEY or BUSINESS_EMAIL missing — email send skipped');
  }

  return { ok: true, status: 200 };
}
