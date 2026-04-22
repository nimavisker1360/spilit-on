"use client";

import Link from "next/link";

import { useLang } from "./i18n";

const FEATURES = [
  {
    title: "POS ile canlı hesap",
    desc: "Garson POS&apos;tan hesabı gönderir göndermez, masadaki misafirlerin telefonunda anında görünür.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="8" y1="20" x2="16" y2="20" />
        <line x1="12" y1="16" x2="12" y2="20" />
      </svg>
    )
  },
  {
    title: "QR ile tek dokunuş",
    desc: "Masadaki QR&apos;ı okutan her misafir kendi telefonundan bölüştürme ekranına düşer.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <path d="M14 14h3v3h-3zM20 14h1M14 20h1M17 17h4v4" />
      </svg>
    )
  },
  {
    title: "Eşit veya ürüne göre böl",
    desc: "Tamamını öde, eşit böl ya da seçtiğin ürünler kadar öde — matematik derdi yok.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="7" r="3" />
        <circle cx="17" cy="17" r="3" />
        <path d="M7 10v4M4 17h6M17 14V10M14 7h6" />
      </svg>
    )
  },
  {
    title: "iyzico, PayTR ve kart",
    desc: "Türkiye&apos;ye özel ödeme altyapısı. Kart, cüzdan veya taksit — hepsi tek akışta.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
        <line x1="6" y1="15" x2="10" y2="15" />
      </svg>
    )
  },
  {
    title: "Bahşiş kısayolları",
    desc: "Ödeme öncesi %5, %10, %15 hazır seçenekler. Personel bahşişi doğrudan alır.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    )
  },
  {
    title: "Otomatik kapanış",
    desc: "Tüm paylar ödendiğinde POS&apos;taki masa otomatik kapanır. Manuel takip yok.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    )
  }
];

const STEPS = [
  {
    num: "01",
    title: "Restoran hesabı gönderir",
    desc: "Kasiyer veya garson POS&apos;tan hesabı masa akışına iletir. Hesap anında oluşur."
  },
  {
    num: "02",
    title: "Misafir QR&apos;ı okutur",
    desc: "Masadaki QR kodu telefona tutması yeterli. Uygulama indirmek gerekmez."
  },
  {
    num: "03",
    title: "Paylaşım seçilir",
    desc: "Eşit böl, ürüne göre böl veya tamamını öde. Her misafir kendi payını görür."
  },
  {
    num: "04",
    title: "Güvenli ödeme",
    desc: "iyzico, PayTR veya kartla saniyeler içinde tamamlanır. Masa otomatik kapanır."
  }
];

const DASHBOARDS = [
  {
    href: "/admin",
    title: "Yönetici Paneli",
    desc: "Şubeler, masalar, QR belirteçleri ve müşteriye yönelik markayı tek yerden yönet.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.07 4.93l-1.41 1.41M4.93 19.07l1.41-1.41M4.93 4.93l1.41 1.41M19.07 19.07l-1.41-1.41M12 2v2M12 20v2M2 12h2M20 12h2" />
      </svg>
    )
  },
  {
    href: "/waiter",
    title: "Garson Paneli",
    desc: "Canlı masa oturumlarını aç, salon operasyonunu hızlıca takip et.",
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
    title: "Mutfak Ekranı",
    desc: "Sipariş kalemlerini hazırlık aşamasına göre takip et. Şube sipariş akışını kullanıyorsa devreye girer.",
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
    title: "Kasa Paneli",
    desc: "Hesabı hazırla ve tam / eşit / ürüne göre bölüştürme akışını başlat.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    )
  }
];

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
          {t.features.items.map((f, i) => (
            <article
              key={f.title}
              className="mp-feature-card mp-reveal"
              data-delay={String((i % 3) + 1)}
            >
              <div className="mp-feature-icon">{FEATURES[i]?.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
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
          {t.steps.items.map((s, i) => (
            <article key={STEPS[i]?.num ?? s.num} className="mp-step mp-reveal" data-delay={String((i % 4) + 1)}>
              <span className="mp-step-num">{STEPS[i]?.num ?? s.num}</span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
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
          {t.dashboards.items.map((d, i) => (
            <Link
              key={DASHBOARDS[i]?.href ?? d.title}
              href={DASHBOARDS[i]?.href ?? "/admin"}
              className="mp-dash-card mp-reveal"
              data-delay={String((i % 4) + 1)}
            >
              <div className="mp-dash-icon">{DASHBOARDS[i]?.icon}</div>
              <div>
                <h3>{d.title}</h3>
                <p>{d.desc}</p>
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
        <div className="mp-providers mp-reveal">
          <span className="mp-providers-label">{t.providers.label}</span>
          <span className="mp-provider-chip"><span className="mp-dot" />iyzico</span>
          <span className="mp-provider-chip"><span className="mp-dot" />PayTR</span>
          <span className="mp-provider-chip"><span className="mp-dot" />Visa / Mastercard</span>
          <span className="mp-provider-chip"><span className="mp-dot" />Troy</span>
          <span className="mp-provider-chip"><span className="mp-dot" />Apple Pay</span>
          <span className="mp-provider-chip"><span className="mp-dot" />Google Pay</span>
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
            <Link href="/admin" className="mp-btn mp-btn-primary">
              {t.cta.primary}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <Link href="/cashier" className="mp-btn mp-btn-ghost">
              {t.cta.secondary}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
