import { InstallAppButton } from "@/components/install-app-button";
import { MasaPayLogo } from "@/components/masapay-logo";

type Props = {
  children: React.ReactNode;
};

export function GuestShell({ children }: Props) {
  return (
    <div className="mobile-layout guest-shell">
      <div className="guest-shell-topbar">
        <MasaPayLogo className="guest-shell-logo" />
        <InstallAppButton />
      </div>

      <main className="mobile-main guest-main">{children}</main>
    </div>
  );
}
