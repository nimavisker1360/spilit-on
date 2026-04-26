import { cookies } from "next/headers";

import { GuestLaunchSplash } from "@/components/guest-launch-splash";
import { DashboardLanguageProvider } from "@/components/layout/dashboard-language";
import { GuestLanguageSwitcher } from "@/components/layout/guest-language-switcher";
import { MasaPayLogo } from "@/components/masapay-logo";
import type { DashboardLocale } from "@/components/layout/dashboard-language";

type Props = {
  children: React.ReactNode;
};

export function GuestShell({ children }: Props) {
  const localeCookie = cookies().get("dashboard-locale")?.value;
  const initialLocale: DashboardLocale = localeCookie === "en" ? "en" : "tr";

  return (
    <DashboardLanguageProvider initialLocale={initialLocale}>
      <div className="mobile-layout guest-shell">
        <GuestLaunchSplash />
        <div className="guest-shell-topbar">
          <MasaPayLogo className="guest-shell-logo" />
          <GuestLanguageSwitcher />
        </div>

        <main className="mobile-main guest-main">{children}</main>
      </div>
    </DashboardLanguageProvider>
  );
}
