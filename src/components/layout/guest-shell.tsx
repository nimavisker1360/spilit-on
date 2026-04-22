import { InstallAppButton } from "@/components/install-app-button";
import { GuestLaunchSplash } from "@/components/guest-launch-splash";
import { MasaPayLogo } from "@/components/masapay-logo";

type Props = {
  children: React.ReactNode;
};

export function GuestShell({ children }: Props) {
  return (
    <div className="mobile-layout guest-shell">
      <GuestLaunchSplash />
      <div className="guest-shell-topbar">
        <MasaPayLogo className="guest-shell-logo" />
        <InstallAppButton />
      </div>

      <main className="mobile-main guest-main">{children}</main>
    </div>
  );
}
