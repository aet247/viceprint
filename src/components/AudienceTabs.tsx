import { useState } from 'react';

interface TabDef {
  id: string;
  label: string;
  title: string;
  copy: string;
  items: string[];
}

const TABS: TabDef[] = [
  {
    id: 'nail',
    label: 'Nail studios',
    title: 'For nail studios',
    copy: 'Offer 500+ designs without hiring a specialist for each one. Fine line art, detailed florals, freehand-level work — printed while the client waits, not booked for a second appointment.',
    items: [
      'Upsell every basic manicure',
      'No design is "too detailed" to offer',
      'Pays for itself within weeks of upsells',
    ],
  },
  {
    id: 'beauty',
    label: 'Beauty parlors',
    title: 'For beauty parlors',
    copy: "Add a signature nail service without a dedicated nail tech on staff — one machine, run by whoever's on the floor that day.",
    items: [
      'New revenue line, no new hire',
      'Consistent quality, every client',
      'Slots next to your existing menu',
    ],
  },
  {
    id: 'tattoo',
    label: 'Tattoo studios',
    title: 'For tattoo studios',
    copy: "Match flash-sheet-level detail on a fingernail, in the time it takes to explain the design. Give clients a way to wear the studio's style between sessions.",
    items: [
      'Sell studio-branded flash as nail art',
      'Low-commitment product for walk-ins',
      'Keeps your art in front of clients daily',
    ],
  },
];

interface Props {
  locale?: string;
}

export default function AudienceTabs({ locale = 'en' }: Props) {
  const [active, setActive] = useState('nail');
  const dark = active === 'tattoo';
  return (
    <section id="audience" lang={locale}>
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">For your business</span>
          <h2>Built for three kinds of studios</h2>
          <p>Same machine, different upside depending on what you run.</p>
        </div>
        <div className={`audience-panels reveal in${dark ? ' dark' : ''}`} id="audiencePanels">
          <div className="tabs" role="tablist" aria-label="Business type">
            {TABS.map((t) => (
              <button
                key={t.id}
                className="btn-tab"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={active === t.id}
                aria-controls={`panel-${t.id}`}
                onClick={() => setActive(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {TABS.map((t) => (
            <div
              key={t.id}
              className="tab-panel"
              role="tabpanel"
              id={`panel-${t.id}`}
              aria-labelledby={`tab-${t.id}`}
              hidden={active !== t.id}
            >
              <h3>{t.title}</h3>
              <p>{t.copy}</p>
              <ul>
                {t.items.map((item) => (
                  <li key={item}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
