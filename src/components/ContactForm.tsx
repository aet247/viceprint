import { useState } from 'react';
import type { ChangeEvent } from 'react';
import type { Locale } from '@/i18n/t';
import { t } from '@/i18n/t';

interface Props {
  locale?: Locale;
}

interface FormState {
  company: string;
  name: string;
  email: string;
  country: string;
  message: string;
  wholesale: boolean;
}

const EMPTY: FormState = { company: '', name: '', email: '', country: '', message: '', wholesale: false };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ContactForm({ locale = 'en' }: Props) {
  const text = t(locale).contact;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [sending, setSending] = useState(false);

  const set =
    (field: keyof FormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [field]: field === 'wholesale' ? (e.target as HTMLInputElement).checked : e.target.value });

  const onSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!form.company.trim() || !form.name.trim() || !form.email.trim() || !form.country.trim() || !form.message.trim()) {
      (window as any).showToast?.(text.errorRequired);
      return;
    }
    if (!EMAIL_RE.test(form.email.trim())) {
      (window as any).showToast?.(text.errorEmail);
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) throw new Error('request failed');
      (window as any).showToast?.(text.toastOk);
      setForm(EMPTY);
    } catch {
      (window as any).showToast?.(text.toastError);
    } finally {
      setSending(false);
    }
  };

  return (
    <form id="leadForm" onSubmit={onSubmit} noValidate>
      <div className="field">
        <label htmlFor="company">{text.labels.company}</label>
        <input id="company" type="text" value={form.company} onChange={set('company')} placeholder={text.placeholder.company} required />
      </div>
      <div className="field">
        <label htmlFor="name">{text.labels.name}</label>
        <input id="name" type="text" value={form.name} onChange={set('name')} placeholder={text.placeholder.name} required />
      </div>
      <div className="field">
        <label htmlFor="email">{text.labels.email}</label>
        <input id="email" type="email" value={form.email} onChange={set('email')} placeholder={text.placeholder.email} required />
      </div>
      <div className="field">
        <label htmlFor="country">{text.labels.country}</label>
        <input id="country" type="text" value={form.country} onChange={set('country')} placeholder={text.placeholder.country} required />
      </div>
      <div className="field">
        <label htmlFor="message">{text.labels.message}</label>
        <textarea id="message" value={form.message} onChange={set('message')} placeholder={text.placeholder.message} required />
      </div>
      <div className="checkbox-row">
        <input id="wholesale" type="checkbox" checked={form.wholesale} onChange={set('wholesale')} />
        <label htmlFor="wholesale">{text.wholesale}</label>
      </div>
      <button className="btn btn-light" type="submit" disabled={sending}>{text.submit}</button>
    </form>
  );
}
