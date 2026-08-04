import { describe, it, expect, vi } from 'vitest';
import type { ContactInput, ContactDeps } from '../../src/lib/contact';
import { handleContact, validateContact } from '../../src/lib/contact';

const valid: ContactInput = {
  company: 'Acme Nails',
  name: 'Jane Doe',
  email: 'jane@acme.com',
  country: 'Germany',
  message: 'Interested in 2 units before the end of the quarter.',
  wholesale: true,
};

function deps(overrides: Partial<ContactDeps> = {}): ContactDeps & { put: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> } {
  const put = vi.fn().mockResolvedValue(undefined);
  const send = vi.fn().mockResolvedValue({ id: 'mock-email-id' });
  return { kv: { put }, resend: { emails: { send } }, fromEmail: 'sales@viceprint.pages.dev', ...overrides, put, send };
}

describe('handleContact', () => {
  it('returns ok for a valid payload, writes KV once and sends one email', async () => {
    const d = deps();
    const res = await handleContact(valid, d);

    expect(res).toEqual({ ok: true, status: 200 });
    expect(d.put).toHaveBeenCalledTimes(1);
    expect(d.put.mock.calls[0][0]).toMatch(/^lead-\d+$/);
    expect(d.send).toHaveBeenCalledTimes(1);
    const sent = d.send.mock.calls[0][0];
    expect(sent.from).toBe('sales@viceprint.pages.dev');
    expect(sent.to).toBe('sales@viceprint.pages.dev');
    expect(sent.subject).toBe('New VICEPRINT lead');
    expect(sent.html).toContain('Acme Nails');
    expect(sent.html).not.toContain('<acme');
  });

  it('returns 400 for a missing/blank field with no side effects', async () => {
    const d = deps();
    const res = await handleContact({ ...valid, name: '   ' }, d);

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(res.error).toBe('name is required');
    expect(d.put).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it('returns 400 for a bad email', async () => {
    const d = deps();
    const res = await handleContact({ ...valid, email: 'not-an-email' }, d);

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(res.error).toBe('email is invalid');
    expect(d.put).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it('returns 400 for an over-length message', async () => {
    const d = deps();
    const res = await handleContact({ ...valid, message: 'x'.repeat(2001) }, d);

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(res.error).toBe('message is too long');
    expect(d.put).not.toHaveBeenCalled();
    expect(d.send).not.toHaveBeenCalled();
  });

  it('still returns ok without credentials (graceful dev mode, no side effects)', async () => {
    const res = await handleContact(valid, {});

    expect(res).toEqual({ ok: true, status: 200 });
  });

  it('escapes user input in the email HTML', async () => {
    const d = deps();
    await handleContact({ ...valid, message: '<script>alert("x")</script> & more' }, d);

    const html = d.send.mock.calls[0][0].html as string;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
  });
});

describe('validateContact', () => {
  it('accepts a valid payload', () => {
    expect(validateContact(valid)).toBeNull();
  });

  it('rejects each missing field', () => {
    for (const field of ['company', 'name', 'email', 'country', 'message'] as const) {
      const copy = { ...valid, [field]: '' };
      expect(validateContact(copy)).toBe(`${field} is required`);
    }
  });

  it('rejects over-length company/name/country/message', () => {
    expect(validateContact({ ...valid, company: 'c'.repeat(201) })).toBe('company is too long');
    expect(validateContact({ ...valid, name: 'n'.repeat(201) })).toBe('name is too long');
    expect(validateContact({ ...valid, country: 'x'.repeat(201) })).toBe('country is too long');
    expect(validateContact({ ...valid, message: 'm'.repeat(2001) })).toBe('message is too long');
  });
});
