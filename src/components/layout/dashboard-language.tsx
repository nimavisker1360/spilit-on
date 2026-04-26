"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type DashboardLocale = "en" | "tr";

type DashboardLanguageContextValue = {
  locale: DashboardLocale;
  setLocale: (locale: DashboardLocale) => void;
  t: (english: string, turkish: string) => string;
};

const STORAGE_KEY = "dashboard-locale";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const DASHBOARD_PATH_PREFIXES = ["/admin", "/waiter", "/kitchen", "/cashier"];

const DashboardLanguageContext = createContext<DashboardLanguageContextValue | null>(null);

type Props = {
  children: React.ReactNode;
  initialLocale?: DashboardLocale;
  forcedLocaleOnMount?: DashboardLocale;
};

function normalizeDashboardLocale(value: string | null | undefined): DashboardLocale | null {
  return value === "en" || value === "tr" ? value : null;
}

function persistDashboardLocale(locale: DashboardLocale) {
  window.localStorage.setItem(STORAGE_KEY, locale);
  document.cookie = `${STORAGE_KEY}=${locale}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  document.documentElement.lang = locale === "tr" ? "tr" : "en";
}

export function DashboardLanguageProvider({
  children,
  initialLocale = "tr",
  forcedLocaleOnMount
}: Props) {
  const [locale, setLocale] = useState<DashboardLocale>(initialLocale);

  useEffect(() => {
    if (forcedLocaleOnMount) {
      setLocale(forcedLocaleOnMount);
      persistDashboardLocale(forcedLocaleOnMount);
      return;
    }

    const savedLocale = normalizeDashboardLocale(window.localStorage.getItem(STORAGE_KEY));
    if (savedLocale) {
      setLocale(savedLocale);
      return;
    }

    const pathname = window.location.pathname;
    const shouldDefaultToTurkish = DASHBOARD_PATH_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );

    if (shouldDefaultToTurkish) {
      persistDashboardLocale("tr");
      return;
    }

    persistDashboardLocale(initialLocale);
  }, [forcedLocaleOnMount, initialLocale]);

  useEffect(() => {
    persistDashboardLocale(locale);
  }, [locale]);

  const value = useMemo<DashboardLanguageContextValue>(
    () => ({
      locale,
      setLocale,
      t: (english, turkish) => (locale === "tr" ? turkish : english)
    }),
    [locale]
  );

  return <DashboardLanguageContext.Provider value={value}>{children}</DashboardLanguageContext.Provider>;
}

export function useDashboardLanguage() {
  const context = useContext(DashboardLanguageContext);

  if (!context) {
    return {
      locale: "en" as DashboardLocale,
      setLocale: () => undefined,
      t: (english: string) => english
    };
  }

  return context;
}
