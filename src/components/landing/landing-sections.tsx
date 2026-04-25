"use client";

import Link from "next/link";

import { useLang } from "./i18n";

const FEATURES = [
  (
    <svg key="feature-live-bill" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="20" x2="16" y2="20" />
      <line x1="12" y1="16" x2="12" y2="20" />
    </svg>
  ),
  (
    <svg key="feature-qr" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14h1M14 20h1M17 17h4v4" />
    </svg>
  ),
  (
    <svg key="feature-split" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="3" />
      <circle cx="17" cy="17" r="3" />
      <path d="M7 10v4M4 17h6M17 14V10M14 7h6" />
    </svg>
  ),
  (
    <svg key="feature-payments" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
      <line x1="6" y1="15" x2="10" y2="15" />
    </svg>
  ),
  (
    <svg key="feature-tip" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  (
    <svg key="feature-close" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
];

const HIGHLIGHT_ICONS = [
  (
    <svg key="highlight-install" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M12 4h9" />
      <path d="M4 9l3 3-3 3" />
      <path d="M4 4v16" />
    </svg>
  ),
  (
    <svg key="highlight-panels" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="7" height="7" rx="1" />
      <rect x="14" y="4" width="7" height="7" rx="1" />
      <rect x="3" y="15" width="7" height="7" rx="1" />
      <rect x="14" y="15" width="7" height="7" rx="1" />
    </svg>
  ),
  (
    <svg key="highlight-session" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  ),
  (
    <svg key="highlight-local" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h20" />
      <path d="M2 6h20" />
      <path d="M2 18h20" />
      <path d="M6 3v18" />
      <path d="M18 3v18" />
    </svg>
  )
];

const REASON_ICONS = [
  (
    <svg key="reason-guest" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  (
    <svg key="reason-ops" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20V10" />
      <path d="M18 20V4" />
      <path d="M6 20v-4" />
    </svg>
  ),
  (
    <svg key="reason-scale" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 11h.01" />
      <path d="M15 11h.01" />
      <path d="M9 15h.01" />
      <path d="M15 15h.01" />
    </svg>
  )
];

const STEPS = [
  { num: "01" },
  { num: "02" },
  { num: "03" },
  { num: "04" }
];

const DASHBOARDS = [
  {
    href: "/admin",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.07 4.93l-1.41 1.41M4.93 19.07l1.41-1.41M4.93 4.93l1.41 1.41M19.07 19.07l-1.41-1.41M12 2v2M12 20v2M2 12h2M20 12h2" />
      </svg>
    )
  },
  {
    href: "/waiter",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    )
  },
  {
    href: "/kitchen",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
        <line x1="6" y1="1" x2="6" y2="4" />
        <line x1="10" y1="1" x2="10" y2="4" />
        <line x1="14" y1="1" x2="14" y2="4" />
      </svg>
    )
  },
  {
    href: "/cashier",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    )
  }
];

export function HighlightsSection() {
  const { t } = useLang();

  return (
    <section className="mp-section" id="sonuclar">
      <div className="mp-container">
        <div className="mp-section-header mp-reveal">
          <span className="mp-kicker">{t.highlights.kicker}</span>
          <h2>{t.highlights.title}</h2>
          <p className="mp-section-lead">{t.highlights.lead}</p>
        </div>

        <div className="mp-highlights-grid">
          {t.highlights.items.map((item, i) => (
            <article
              key={`${item.value}-${item.label}`}
              className="mp-highlight-card mp-reveal"
              data-delay={String((i % 4) + 1)}
            >
              <div className="mp-highlight-icon">{HIGHLIGHT_ICONS[i]}</div>
              <div className="mp-highlight-value">{item.value}</div>
              <div className="mp-highlight-label">{item.label}</div>
              <p>{item.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FeaturesSection() {
  const { t } = useLang();

  return (
    <section className="mp-section" id="ozellikler">
      <div className="mp-container">
        <div className="mp-section-header mp-reveal">
          <span className="mp-kicker">{t.features.kicker}</span>
          <h2>{t.features.title}</h2>
          <p className="mp-section-lead">{t.features.lead}</p>
        </div>

        <div className="mp-features-grid">
          {t.features.items.map((item, i) => (
            <article
              key={item.title}
              className="mp-feature-card mp-reveal"
              data-delay={String((i % 3) + 1)}
            >
              <div className="mp-feature-icon">{FEATURES[i]}</div>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ReasonsSection() {
  const { t } = useLang();

  return (
    <section className="mp-section" id="neden-masapayz">
      <div className="mp-container">
        <div className="mp-section-header mp-reveal">
          <span className="mp-kicker">{t.reasons.kicker}</span>
          <h2>{t.reasons.title}</h2>
          <p className="mp-section-lead">{t.reasons.lead}</p>
        </div>

        <div className="mp-reasons-grid">
          {t.reasons.items.map((item, i) => (
            <article
              key={item.title}
              className="mp-reason-card mp-reveal"
              data-delay={String((i % 3) + 1)}
            >
              <div className="mp-reason-icon">{REASON_ICONS[i]}</div>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
              <ul className="mp-reason-bullets">
                {item.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HowItWorksSection() {
  const { t } = useLang();

  return (
    <section className="mp-section" id="nasil-calisir">
      <div className="mp-container">
        <div className="mp-section-header mp-reveal">
          <span className="mp-kicker">{t.steps.kicker}</span>
          <h2>{t.steps.title}</h2>
          <p className="mp-section-lead">{t.steps.lead}</p>
        </div>

        <div className="mp-steps">
          {t.steps.items.map((item, i) => (
            <article key={item.title} className="mp-step mp-reveal" data-delay={String((i % 4) + 1)}>
              <span className="mp-step-num">{STEPS[i]?.num ?? item.num}</span>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function DashboardsSection() {
  const { t } = useLang();

  return (
    <section className="mp-section" id="panel">
      <div className="mp-container">
        <div className="mp-section-header mp-reveal">
          <span className="mp-kicker">{t.dashboards.kicker}</span>
          <h2>{t.dashboards.title}</h2>
          <p className="mp-section-lead">{t.dashboards.lead}</p>
        </div>

        <div className="mp-dash-grid">
          {t.dashboards.items.map((item, i) => (
            <Link
              key={DASHBOARDS[i]?.href ?? item.title}
              href={DASHBOARDS[i]?.href ?? "/admin"}
              className="mp-dash-card mp-reveal"
              data-delay={String((i % 4) + 1)}
            >
              <div className="mp-dash-icon">{DASHBOARDS[i]?.icon}</div>
              <div>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </div>
              <div className="mp-dash-card-arrow">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PaymentProvidersSection() {
  const { t } = useLang();

  return (
    <section className="mp-section" id="odeme" style={{ paddingTop: 40, paddingBottom: 40 }}>
      <div className="mp-container">
        <div className="mp-providers-wrap mp-reveal">
          <div className="mp-providers">
            <span className="mp-providers-label">{t.providers.label}</span>
            <span className="mp-provider-chip"><span className="mp-dot" />iyzico</span>
            <span className="mp-provider-chip"><span className="mp-dot" />PayTR</span>
            <span className="mp-provider-chip"><span className="mp-dot" />Visa / Mastercard</span>
            <span className="mp-provider-chip"><span className="mp-dot" />Troy</span>
          </div>
          <p className="mp-providers-note">{t.providers.note}</p>
        </div>
      </div>
    </section>
  );
}

export function CtaSection() {
  const { t } = useLang();

  return (
    <section className="mp-section" id="baslangic" style={{ paddingTop: 40 }}>
      <div className="mp-container">
        <div className="mp-cta mp-reveal">
          <span className="mp-kicker" style={{ marginBottom: 18 }}>{t.cta.kicker}</span>
          <h2>{t.cta.title}</h2>
          <p>{t.cta.desc}</p>
          <div className="mp-cta-actions">
            <Link href={t.cta.primaryHref} className="mp-btn mp-btn-primary">
              {t.cta.primary}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <Link href={t.cta.secondaryHref} className="mp-btn mp-btn-ghost">
              {t.cta.secondary}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
