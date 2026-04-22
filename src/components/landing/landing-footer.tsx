"use client";

import Link from "next/link";

import { useLang } from "./i18n";

export function LandingFooter() {
  const { t } = useLang();
  const year = new Date().getFullYear();

  return (
    <footer className="mp-footer">
      <div className="mp-container">
        <div className="mp-footer-grid">
          <div className="mp-footer-brand">
            <Link href="/" className="mp-nav-brand" aria-label={t.nav.brandAria}>
              <FooterMark />
              <span>
                Masa<strong>Payz</strong>
              </span>
            </Link>
            <p>{t.footer.tagline}</p>
          </div>

          <div className="mp-footer-col">
            <h4>{t.footer.product.title}</h4>
            <ul>
              {t.footer.product.items.map((item) => (
                <li key={item.href}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          </div>

          <div className="mp-footer-col">
            <h4>{t.footer.company.title}</h4>
            <ul>
              {t.footer.company.items.map((item) => (
                <li key={item}>
                  <a href="#">{item}</a>
                </li>
              ))}
            </ul>
          </div>

          <div className="mp-footer-col">
            <h4>{t.footer.legal.title}</h4>
            <ul>
              {t.footer.legal.items.map((item) => (
                <li key={item}>
                  <a href="#">{item}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mp-footer-bottom">
          <span>&copy; {year} MasaPayz. {t.footer.rights}</span>
          <div className="mp-socials" aria-label="Sosyal medya">
            <a href="#" aria-label="Twitter">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a href="#" aria-label="Instagram">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
              </svg>
            </a>
            <a href="#" aria-label="LinkedIn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM10 9h3.8v1.7h.05a4.16 4.16 0 0 1 3.75-2.06C21.03 8.64 22 10.96 22 14.17V21h-4v-6.06c0-1.45-.03-3.31-2.02-3.31-2.03 0-2.34 1.58-2.34 3.2V21h-4z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M14.2383 0C12.736 2.15616 14.2281 7.85675 14.5548 10.4416L15.8204 10.1252C15.4684 7.33992 15.798 2.28295 14.2383 0Z" fill="#FF7000" />
      <path d="M18.3521 0.316559L16.1372 10.1254L17.4029 10.4418L19.3013 0.632972L18.3521 0.316559Z" fill="#FF7000" />
      <path d="M9.17592 1.58195L12.6565 10.7579L6.64462 3.48042L5.37897 3.79684L11.3908 12.0236L2.84766 6.64455L2.53125 7.9102L11.0744 13.2892L12.6565 10.7579L14.2385 10.4415L10.4416 1.26553L9.17592 1.58195Z" fill="#FF7000" />
      <path d="M22.4654 1.58206L17.7192 10.758C19.9267 11.0921 23.9614 3.29003 22.4654 1.58206Z" fill="#FF7000" />
      <path d="M13.9219 21.1996L12.3398 31.3248C15.2464 30.4746 13.6353 23.7528 15.8204 21.8324C15.8204 23.8575 15.5273 30.6838 17.7189 31.3248C17.7175 29.2881 18.1304 23.315 16.7608 21.778C16.2057 21.155 14.6921 21.2833 13.9219 21.1996Z" fill="#FF7000" />
    </svg>
  );
}
