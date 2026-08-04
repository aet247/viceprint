import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { Locale } from '@/i18n/t';
import { t } from '@/i18n/t';

interface Props {
  tier: 'reserve' | 'founder';
  locale?: Locale;
}

interface FormState {
  company: string;
  email: string;
  country: string;
}

const AMOUNT = { reserve: '750.00', founder: '1499.00' } as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ReservationButtons({ tier, locale = 'en' }: Props) {
  const text = t(locale).reservation;
  const [form, setForm] = useState<FormState>({ company: '', email: '', country: '' });
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'form' | 'paypal'>('form');
  const [processing, setProcessing] = useState(false);
  const orderForm = useRef<FormState | null>(null);
  const paypalRef = useRef<HTMLDivElement>(null);

  const clientId = import.meta.env.PUBLIC_PAYPAL_CLIENT_ID as string | undefined;

  const set =
    (field: keyof FormState) =>
    (e: ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [field]: e.target.value });

  const onSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError('');
    const values = { company: form.company.trim(), email: form.email.trim(), country: form.country.trim() };
    if (!values.company || !values.email || !values.country) {
      setError(text.errorRequired);
      return;
    }
    if (!EMAIL_RE.test(values.email)) {
      setError(text.errorEmail);
      return;
    }
    if (!clientId) {
      (window as any).showToast?.(text.openingSoonToast);
      return;
    }
    orderForm.current = values;
    setPhase('paypal');
    try {
      const { loadScript } = await import('@paypal/paypal-js');
      const paypal = await loadScript({ clientId, currency: 'EUR', intent: 'capture', components: 'buttons' });
      if (!paypalRef.current) return;
      await paypal
        .Buttons({
          createOrder: (_data, actions) =>
            actions.order.create({
              intent: 'CAPTURE',
              purchase_units: [
                {
                  amount: { value: AMOUNT[tier], currency_code: 'EUR' },
                  description: `VICEPRINT reservation — ${tier === 'founder' ? 'Founder (full prepay)' : 'Reserve (50% deposit)'}`,
                },
              ],
            }),
          onApprove: async (_data, actions) => {
            setProcessing(true);
            try {
              const details = (await actions.order.capture()) as { id?: string };
              const res = await fetch('/api/reservation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reserve', tier, orderId: details.id, form: orderForm.current }),
              });
              if (!res.ok) throw new Error('Reservation capture failed on server');
              (window as any).showToast?.(text.confirmedToast);
              setForm({ company: '', email: '', country: '' });
            } catch {
              (window as any).showToast?.(text.capturedToast);
            } finally {
              setPhase('form');
              setProcessing(false);
            }
          },
          style: { layout: 'vertical', shape: 'pill', label: 'pay' },
        })
        .render(paypalRef.current);
    } catch {
      (window as any).showToast?.(text.capturedToast);
      setPhase('form');
    }
  };

  return (
    <form className="price-form" onSubmit={onSubmit} noValidate>
      <div className="field">
        <label htmlFor={`res-company-${tier}`}>{text.labels.company}</label>
        <input
          id={`res-company-${tier}`}
          type="text"
          value={form.company}
          onChange={set('company')}
          placeholder={text.placeholders.company}
          disabled={phase === 'paypal'}
          required
        />
      </div>
      <div className="field">
        <label htmlFor={`res-email-${tier}`}>{text.labels.email}</label>
        <input
          id={`res-email-${tier}`}
          type="email"
          value={form.email}
          onChange={set('email')}
          placeholder={text.placeholders.email}
          disabled={phase === 'paypal'}
          required
        />
      </div>
      <div className="field">
        <label htmlFor={`res-country-${tier}`}>{text.labels.country}</label>
        <input
          id={`res-country-${tier}`}
          type="text"
          value={form.country}
          onChange={set('country')}
          placeholder={text.placeholders.country}
          disabled={phase === 'paypal'}
          required
        />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {phase === 'form' && (
        <button className="btn btn-ghost" type="submit">
          {text.submit}
        </button>
      )}
      {phase === 'paypal' && clientId && (
        <div className="paypal-box">
          <div ref={paypalRef} id={`paypal-${tier}`} />
          {processing && <p className="processing">{text.processing}</p>}
        </div>
      )}
      {!clientId && <p className="price-open">{text.openingSoon}</p>}
    </form>
  );
}
