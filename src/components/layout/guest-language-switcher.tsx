"use client";

import { useDashboardLanguage } from "@/components/layout/dashboard-language";

function FlagTR() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="guest-flag-tr-clip">
          <circle cx="12" cy="12" r="11" />
        </clipPath>
      </defs>
      <g clipPath="url(#guest-flag-tr-clip)">
        <rect width="24" height="24" fill="#E30A17" />
        <circle cx="10.3" cy="12" r="4.4" fill="#ffffff" />
        <circle cx="11.3" cy="12" r="3.5" fill="#E30A17" />
        <polygon fill="#ffffff" points="15.2,12 12.9,12.75 14.35,10.8 14.35,13.2 12.9,11.25" />
      </g>
      <circle cx="12" cy="12" r="11" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
    </svg>
  );
}

function FlagEN() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="guest-flag-en-clip">
          <circle cx="12" cy="12" r="11" />
        </clipPath>
      </defs>
      <g clipPath="url(#guest-flag-en-clip)">
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

export function GuestLanguageSwitcher() {
  const { locale, setLocale, t } = useDashboardLanguage();

  return (
    <div className="mp-lang-switcher" role="group" aria-label={t("Guest language", "Misafir dili")}>
      <button
        type="button"
        className={`mp-lang-btn${locale === "tr" ? " is-active" : ""}`}
        onClick={() => setLocale("tr")}
        aria-pressed={locale === "tr"}
        title={t("Switch to Turkish", "Turkceye gec")}
        aria-label={t("Switch to Turkish", "Turkceye gec")}
      >
        <FlagTR />
      </button>
      <button
        type="button"
        className={`mp-lang-btn${locale === "en" ? " is-active" : ""}`}
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        title={t("Switch to English", "Ingilizceye gec")}
        aria-label={t("Switch to English", "Ingilizceye gec")}
      >
        <FlagEN />
      </button>
    </div>
  );
}
