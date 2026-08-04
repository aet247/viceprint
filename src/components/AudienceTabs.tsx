import { useState } from 'react';
import type { Locale } from '@/i18n/t';
import { t } from '@/i18n/t';

const TAB_IDS = ['nail', 'beauty', 'tattoo'] as const;

interface Props {
  locale?: Locale;
}

export default function AudienceTabs({ locale = 'en' }: Props) {
  const [active, setActive] = useState<(typeof TAB_IDS)[number]>('nail');
  const dark = active === 'tattoo';
  const text = t(locale);
  return (
    <section id="audience" lang={locale}>
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">{text.audience.eyebrow}</span>
          <h2>{text.audience.heading}</h2>
          <p>{text.audience.sub}</p>
        </div>
        <div className={`audience-panels reveal in${dark ? ' dark' : ''}`} id="audiencePanels">
          <div className="tabs" role="tablist" aria-label={text.audience.tablistLabel}>
            {TAB_IDS.map((id) => (
              <button
                key={id}
                className="btn-tab"
                role="tab"
                id={`tab-${id}`}
                aria-selected={active === id}
                aria-controls={`panel-${id}`}
                onClick={() => setActive(id)}
              >
                {text.audience.tabs[id]}
              </button>
            ))}
          </div>
          {TAB_IDS.map((id) => {
            const panel = text.audience.panels[id];
            return (
              <div
                key={id}
                className="tab-panel"
                role="tabpanel"
                id={`panel-${id}`}
                aria-labelledby={`tab-${id}`}
                hidden={active !== id}
              >
                <h3>{panel.title}</h3>
                <p>{panel.text}</p>
                <ul>
                  {panel.points.map((item) => (
                    <li key={item}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
