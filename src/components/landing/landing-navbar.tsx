"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useLang, type Lang } from "./i18n";

export function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { lang, setLang, t } = useLang();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <nav className={`mp-nav${scrolled ? " is-scrolled" : ""}`} aria-label={t.nav.aria}>
        <Link href="/" className="mp-nav-brand" aria-label={t.nav.brandAria}>
          <BrandMark />
          <span>
            Masa<strong>Payz</strong>
          </span>
        </Link>

        <div className="mp-nav-links">
          {t.nav.items.map((item) => (
            <a key={item.href} href={item.href} className="mp-nav-link">
              {item.label}
            </a>
          ))}
        </div>

        <div className="mp-nav-right">
          <LangSwitcher lang={lang} setLang={setLang} trLabel={t.nav.langTr} enLabel={t.nav.langEn} groupLabel={t.nav.langSwitcherLabel} />
          <Link href={t.nav.ctaHref} className="mp-nav-cta" scroll>
            {t.nav.cta}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>

        <button
          type="button"
          className={`mp-nav-mobile-toggle${open ? " is-open" : ""}`}
          aria-label={open ? t.nav.menuClose : t.nav.menuOpen}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="mp-nav-toggle-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      </nav>

      <div className={`mp-nav-mobile-panel${open ? " is-open" : ""}`} role="dialog" aria-label={t.nav.mobileMenuAria} aria-hidden={!open}>
        {t.nav.items.map((item) => (
          <a key={item.href} href={item.href} onClick={() => setOpen(false)}>
            {item.label}
          </a>
        ))}
        <LangSwitcher
          lang={lang}
          setLang={setLang}
          trLabel={t.nav.langTr}
          enLabel={t.nav.langEn}
          groupLabel={t.nav.langSwitcherLabel}
          compact
        />
        <Link href={t.nav.ctaHref} className="mp-nav-cta" onClick={() => setOpen(false)} scroll>
          {t.nav.cta}
        </Link>
      </div>
    </>
  );
}

function LangSwitcher({
  lang,
  setLang,
  trLabel,
  enLabel,
  groupLabel,
  compact = false
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  trLabel: string;
  enLabel: string;
  groupLabel: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`mp-lang-switcher${compact ? " is-compact" : ""}`}
      role="group"
      aria-label={groupLabel}
    >
      <button
        type="button"
        className={`mp-lang-btn${lang === "tr" ? " is-active" : ""}`}
        aria-pressed={lang === "tr"}
        aria-label={trLabel}
        title={trLabel}
        onClick={() => setLang("tr")}
      >
        <FlagTR />
      </button>
      <button
        type="button"
        className={`mp-lang-btn${lang === "en" ? " is-active" : ""}`}
        aria-pressed={lang === "en"}
        aria-label={enLabel}
        title={enLabel}
        onClick={() => setLang("en")}
      >
        <FlagEN />
      </button>
    </div>
  );
}

function FlagTR() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id="mp-flag-tr-clip">
          <circle cx="12" cy="12" r="11" />
        </clipPath>
      </defs>
      <g clipPath="url(#mp-flag-tr-clip)">
        <rect width="24" height="24" fill="#E30A17" />
        <circle cx="10.3" cy="12" r="4.4" fill="#ffffff" />
        <circle cx="11.3" cy="12" r="3.5" fill="#E30A17" />
        <polygon
          fill="#ffffff"
          points="15.2,12 12.9,12.75 14.35,10.8 14.35,13.2 12.9,11.25"
        />
      </g>
      <circle cx="12" cy="12" r="11" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
    </svg>
  );
}

function FlagEN() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id="mp-flag-en-clip">
          <circle cx="12" cy="12" r="11" />
        </clipPath>
      </defs>
      <g clipPath="url(#mp-flag-en-clip)">
        <rect width="24" height="24" fill="#012169" />
        <path d="M0,0 L24,24 M24,0 L0,24" stroke="#ffffff" strokeWidth="4" />
        <path d="M0,0 L24,24 M24,0 L0,24" stroke="#C8102E" strokeWidth="2" />
        <path d="M12,0 V24 M0,12 H24" stroke="#ffffff" strokeWidth="6" />
        <path d="M12,0 V24 M0,12 H24" stroke="#C8102E" strokeWidth="3" />
      </g>
      <circle cx="12" cy="12" r="11" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
    </svg>
  );
}

function BrandMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M14.2383 0C12.736 2.15616 14.2281 7.85675 14.5548 10.4416L15.8204 10.1252C15.4684 7.33992 15.798 2.28295 14.2383 0Z" fill="#FF7000" />
      <path d="M18.3521 0.316559L16.1372 10.1254L17.4029 10.4418L19.3013 0.632972L18.3521 0.316559Z" fill="#FF7000" />
      <path d="M9.17592 1.58195L12.6565 10.7579L6.64462 3.48042L5.37897 3.79684L11.3908 12.0236L2.84766 6.64455L2.53125 7.9102L11.0744 13.2892L12.6565 10.7579L14.2385 10.4415L10.4416 1.26553L9.17592 1.58195Z" fill="#FF7000" />
      <path d="M22.4654 1.58206L17.7192 10.758C19.9267 11.0921 23.9614 3.29003 22.4654 1.58206Z" fill="#FF7000" />
      <path d="M19.3013 12.0235C22.1476 11.4234 25.5813 7.06035 27.2116 4.74601C24.5565 4.52357 19.9833 9.59364 19.3013 12.0235Z" fill="#FF7000" />
      <path d="M0.949714 10.7579L0.633301 11.7072C3.30933 13.1116 7.41982 14.4168 10.4421 14.5549C9.62297 12.1993 3.24206 11.2324 0.949714 10.7579Z" fill="#FF7000" />
      <path d="M0 15.188V16.4536H10.1252V15.188H0Z" fill="#FF7000" />
      <path d="M21.1992 16.4535L31.3244 16.1371V15.5042C29.3155 14.9104 21.9548 14.1769 21.1992 16.4535Z" fill="#FF7000" />
      <path d="M20.8833 17.0865C21.7046 19.4466 28.0861 20.4096 30.3757 20.8835L30.6921 20.5671V19.9342C27.9988 18.5207 23.9249 17.2191 20.8833 17.0865Z" fill="#FF7000" />
      <path d="M20.5664 18.352L19.9336 19.6177L28.4767 24.9967L28.7932 23.731L20.5664 18.352Z" fill="#FF7000" />
      <path d="M4.42969 26.895L4.7461 27.2114L12.34 20.5668C10.3012 18.6933 5.27948 25.0728 4.42969 26.895Z" fill="#FF7000" />
      <path d="M20.8833 30.3756H22.1489L18.6684 20.5668H18.9848C20.2824 23.0816 23.0503 26.9327 25.6294 28.1607L25.9459 27.8443C24.9225 25.5481 22.4579 22.2579 20.4753 20.6811C19.6299 20.0087 18.0292 20.1605 17.6268 21.3232C16.9124 23.3878 20.2989 28.2401 20.8833 30.3756Z" fill="#FF7000" />
      <path d="M12.34 20.5669C11.4558 22.6908 7.12803 28.1911 8.85947 30.0592L13.6057 20.8833L12.34 20.5669Z" fill="#FF7000" />
      <path d="M13.9219 21.1996L12.3398 31.3248C15.2464 30.4746 13.6353 23.7528 15.8204 21.8324C15.8204 23.8575 15.5273 30.6838 17.7189 31.3248C17.7175 29.2881 18.1304 23.315 16.7608 21.778C16.2057 21.155 14.6921 21.2833 13.9219 21.1996Z" fill="#FF7000" />
    </svg>
  );
}
