import { InstallAppButton } from "@/components/install-app-button";

type Props = {
  children: React.ReactNode;
};

export function GuestShell({ children }: Props) {
  return (
    <div className="mobile-layout guest-shell">
      <div className="guest-shell-install">
        <InstallAppButton />
      </div>

      <main className="mobile-main guest-main">{children}</main>
    </div>
  );
}
