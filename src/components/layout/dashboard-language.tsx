"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type DashboardLocale = "en" | "tr";

type DashboardLanguageContextValue = {
  locale: DashboardLocale;
  setLocale: (locale: DashboardLocale) => void;
  t: (english: string, turkish: string) => string;
};

const STORAGE_KEY = "dashboard-locale";

const DashboardLanguageContext = createContext<DashboardLanguageContextValue | null>(null);

type Props = {
  children: React.ReactNode;
};

export function DashboardLanguageProvider({ children }: Props) {
  const [locale, setLocale] = useState<DashboardLocale>("tr");

  useEffect(() => {
    const savedLocale = window.localStorage.getItem(STORAGE_KEY);
    if (savedLocale === "en" || savedLocale === "tr") {
      setLocale(savedLocale);
      document.documentElement.lang = savedLocale === "tr" ? "tr" : "en";
      return;
    }

    setLocale("tr");
    document.documentElement.lang = "tr";
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale === "tr" ? "tr" : "en";
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
