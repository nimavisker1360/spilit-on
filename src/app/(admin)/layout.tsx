import { RoleLayout } from "@/components/layout/role-layout";

export const dynamic = "force-dynamic";

type Props = {
  children: React.ReactNode;
};

export default function AdminLayout({ children }: Props) {
  return <RoleLayout role="admin">{children}</RoleLayout>;
}
