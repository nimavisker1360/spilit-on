import { SuperAdminRestaurantDetail } from "@/components/super-admin/super-admin-pages";
import { SuperAdminShell } from "@/components/super-admin/super-admin-shell";
import { requireSuperAdminPage } from "@/features/super-admin/session";

export const dynamic = "force-dynamic";

type Props = {
  params: {
    restaurantId: string;
  };
};

export default async function SuperAdminRestaurantDetailPage({ params }: Props) {
  const admin = await requireSuperAdminPage();

  return (
    <SuperAdminShell admin={admin}>
      <SuperAdminRestaurantDetail restaurantId={params.restaurantId} />
    </SuperAdminShell>
  );
}
