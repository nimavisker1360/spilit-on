import { RoleLayout } from "@/components/layout/role-layout";

type Props = {
  children: React.ReactNode;
};

export default function KitchenLayout({ children }: Props) {
  return <RoleLayout role="kitchen">{children}</RoleLayout>;
}
