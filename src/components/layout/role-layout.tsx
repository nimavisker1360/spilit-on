import { DashboardLanguageProvider } from "@/components/layout/dashboard-language";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { AppRole } from "@/types";

type Props = {
  children: React.ReactNode;
  role: AppRole;
};

export function RoleLayout({ children, role }: Props) {
  return (
    <DashboardLanguageProvider>
      <DashboardShell role={role}>{children}</DashboardShell>
    </DashboardLanguageProvider>
  );
}
