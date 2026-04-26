import { cookies } from "next/headers";

import { DashboardLanguageProvider } from "@/components/layout/dashboard-language";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { DashboardLocale } from "@/components/layout/dashboard-language";
import type { AppRole } from "@/types";

type Props = {
  children: React.ReactNode;
  role: AppRole;
};

export function RoleLayout({ children, role }: Props) {
  const localeCookie = cookies().get("dashboard-locale")?.value;
  const initialLocale: DashboardLocale = role === "admin" ? "tr" : localeCookie === "en" ? "en" : "tr";
  const forcedLocaleOnMount: DashboardLocale | undefined = role === "admin" ? "tr" : undefined;

  return (
    <DashboardLanguageProvider initialLocale={initialLocale} forcedLocaleOnMount={forcedLocaleOnMount}>
      <DashboardShell role={role}>{children}</DashboardShell>
    </DashboardLanguageProvider>
  );
}
