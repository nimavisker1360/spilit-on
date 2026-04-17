import { GuestShell } from "@/components/layout/guest-shell";

type Props = {
  children: React.ReactNode;
};

export default function GuestLayout({ children }: Props) {
  return <GuestShell>{children}</GuestShell>;
}
