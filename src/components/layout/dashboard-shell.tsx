"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { InstallAppButton } from "@/components/install-app-button";
import { useDashboardLanguage } from "@/components/layout/dashboard-language";
import { LogoutButton } from "@/components/layout/logout-button";
import { DASHBOARD_NAV_LINKS, ROLE_LAYOUT_META } from "@/lib/navigation";
import type { AppRole } from "@/types";

const NAV_ICONS: Record<string, React.ReactNode> = {
  "/": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  "/admin": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.07 4.93l-1.41 1.41M4.93 19.07l1.41-1.41M4.93 4.93l1.41 1.41M19.07 19.07l-1.41-1.41M12 2v2M12 20v2M2 12h2M20 12h2" />
    </svg>
  ),
  "/waiter": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  "/kitchen": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
      <line x1="6" y1="1" x2="6" y2="4" />
      <line x1="10" y1="1" x2="10" y2="4" />
      <line x1="14" y1="1" x2="14" y2="4" />
    </svg>
  ),
  "/cashier": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  ),
};

type Props = {
  children: React.ReactNode;
  role: AppRole;
};

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
        <clipPath id="dashboard-flag-tr-clip">
          <circle cx="12" cy="12" r="11" />
        </clipPath>
      </defs>
      <g clipPath="url(#dashboard-flag-tr-clip)">
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
        <clipPath id="dashboard-flag-en-clip">
          <circle cx="12" cy="12" r="11" />
        </clipPath>
      </defs>
      <g clipPath="url(#dashboard-flag-en-clip)">
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

export function DashboardShell({ children, role }: Props) {
  const pathname = usePathname();
  const { locale, setLocale, t } = useDashboardLanguage();
  const layoutMeta = ROLE_LAYOUT_META[role];
  const navLabels: Record<string, string> = {
    "/": t("Home", "Ana Sayfa"),
    "/admin": t("Admin", "Yonetim"),
    "/waiter": t("Waiter", "Garson"),
    "/kitchen": t("Kitchen", "Mutfak"),
    "/cashier": t("Cashier", "Kasiyer")
  };
  const roleCopy: Record<AppRole, { title: string; subtitle: string }> = {
    admin: {
      title: t("Admin dashboard", "Yonetim paneli"),
      subtitle: t("Manage branches, tables, menu, and QR access.", "Subeleri, masalari, menuyu ve QR erisimini yonetin.")
    },
    waiter: {
      title: t("Waiter dashboard", "Garson paneli"),
      subtitle: t("Open tables and place floor orders quickly.", "Masalari acin ve salon siparislerini hizlica yonetin.")
    },
    kitchen: {
      title: t("Kitchen dashboard", "Mutfak paneli"),
      subtitle: t("Track live tickets and update prep status.", "Canli fisleri izleyin ve hazirlama durumunu guncelleyin.")
    },
    cashier: {
      title: t("Cashier dashboard", "Kasiyer paneli"),
      subtitle: t("Calculate split bills with clear invoice summaries.", "Bolunmus hesaplari net fatura ozetleriyle hesaplayin.")
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return (
    <div className={`dashboard-shell dashboard-shell--${role}`}>
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14.2383 0C12.736 2.15616 14.2281 7.85675 14.5548 10.4416L15.8204 10.1252C15.4684 7.33992 15.798 2.28295 14.2383 0Z" fill="#FF7000"/>
            <path d="M18.3521 0.316559L16.1372 10.1254L17.4029 10.4418L19.3013 0.632972L18.3521 0.316559Z" fill="#FF7000"/>
            <path d="M9.17592 1.58195L12.6565 10.7579L6.64462 3.48042L5.37897 3.79684L11.3908 12.0236L2.84766 6.64455L2.53125 7.9102L11.0744 13.2892L12.6565 10.7579L14.2385 10.4415L10.4416 1.26553L9.17592 1.58195Z" fill="#FF7000"/>
            <path d="M22.4654 1.58206L17.7192 10.758C19.9267 11.0921 23.9614 3.29003 22.4654 1.58206Z" fill="#FF7000"/>
            <path d="M19.3013 12.0235C22.1476 11.4234 25.5813 7.06035 27.2116 4.74601C24.5565 4.52357 19.9833 9.59364 19.3013 12.0235Z" fill="#FF7000"/>
            <path d="M0.949714 10.7579L0.633301 11.7072C3.30933 13.1116 7.41982 14.4168 10.4421 14.5549C9.62297 12.1993 3.24206 11.2324 0.949714 10.7579Z" fill="#FF7000"/>
            <path d="M0 15.188V16.4536H10.1252V15.188H0Z" fill="#FF7000"/>
            <path d="M21.1992 16.4535L31.3244 16.1371V15.5042C29.3155 14.9104 21.9548 14.1769 21.1992 16.4535Z" fill="#FF7000"/>
            <path d="M20.8833 17.0865C21.7046 19.4466 28.0861 20.4096 30.3757 20.8835L30.6921 20.5671V19.9342C27.9988 18.5207 23.9249 17.2191 20.8833 17.0865Z" fill="#FF7000"/>
            <path d="M20.5664 18.352L19.9336 19.6177L28.4767 24.9967L28.7932 23.731L20.5664 18.352Z" fill="#FF7000"/>
            <path d="M4.42969 26.895L4.7461 27.2114L12.34 20.5668C10.3012 18.6933 5.27948 25.0728 4.42969 26.895Z" fill="#FF7000"/>
            <path d="M20.8833 30.3756H22.1489L18.6684 20.5668H18.9848C20.2824 23.0816 23.0503 26.9327 25.6294 28.1607L25.9459 27.8443C24.9225 25.5481 22.4579 22.2579 20.4753 20.6811C19.6299 20.0087 18.0292 20.1605 17.6268 21.3232C16.9124 23.3878 20.2989 28.2401 20.8833 30.3756Z" fill="#FF7000"/>
            <path d="M12.34 20.5669C11.4558 22.6908 7.12803 28.1911 8.85947 30.0592L13.6057 20.8833L12.34 20.5669Z" fill="#FF7000"/>
            <path d="M13.9219 21.1996L12.3398 31.3248C15.2464 30.4746 13.6353 23.7528 15.8204 21.8324C15.8204 23.8575 15.5273 30.6838 17.7189 31.3248C17.7175 29.2881 18.1304 23.315 16.7608 21.778C16.2057 21.155 14.6921 21.2833 13.9219 21.1996Z" fill="#FF7000"/>
          </svg>
          <span className="sidebar-brand-text">Masa<span style={{color:"#fff"}}>Payz</span></span>
        </div>

        <nav className="sidebar-nav" aria-label="Dashboard Navigation">
          {DASHBOARD_NAV_LINKS.map((link) => {
            const isActive = link.href === layoutMeta.activeHref;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`sidebar-nav-link${isActive ? " is-active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="sidebar-nav-icon">{NAV_ICONS[link.href]}</span>
                <span>{navLabels[link.href] ?? link.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <InstallAppButton />
          <LogoutButton />
        </div>
      </aside>

      <div className="dashboard-content">
        <header className="dashboard-topbar">
          <div className="brand-wrap">
            <span className="brand-dot" />
            <div>
              <h1 className="brand-title">{roleCopy[role].title}</h1>
              <p className="brand-subtitle">{roleCopy[role].subtitle}</p>
            </div>
          </div>
          <div className="dashboard-topbar-actions">
            <div className="mp-lang-switcher" role="group" aria-label={t("Dashboard language", "Panel dili")}>
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
          </div>
        </header>
        <main className="dashboard-main">{children}</main>
      </div>
    </div>
  );
}
