import { SuperAdminDataPage } from "@/components/super-admin/super-admin-pages";
import { SuperAdminShell } from "@/components/super-admin/super-admin-shell";
import { requireSuperAdminPage } from "@/features/super-admin/session";

export const dynamic = "force-dynamic";

export default async function SuperAdminDashboardPage() {
  const admin = await requireSuperAdminPage();

  return (
    <SuperAdminShell admin={admin}>
      <SuperAdminDataPage kind="dashboard" />
    </SuperAdminShell>
  );
}
