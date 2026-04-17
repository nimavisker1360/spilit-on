import { RoleLayout } from "@/components/layout/role-layout";

type Props = {
  children: React.ReactNode;
};

export default function CashierLayout({ children }: Props) {
  return <RoleLayout role="cashier">{children}</RoleLayout>;
}
