import { RoleLayout } from "@/components/layout/role-layout";

export const dynamic = "force-dynamic";

type Props = {
  children: React.ReactNode;
};

export default function WaiterLayout({ children }: Props) {
  return <RoleLayout role="waiter">{children}</RoleLayout>;
}
