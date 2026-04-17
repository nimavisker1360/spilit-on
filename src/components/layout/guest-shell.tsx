import Link from "next/link";

import { InstallAppButton } from "@/components/install-app-button";

type Props = {
  children: React.ReactNode;
};

export function GuestShell({ children }: Props) {
  return (
    <div className="mobile-layout guest-shell">
      <header className="mobile-header guest-header">
        <div>
          <p className="eyebrow">Customer QR flow</p>
          <h1 className="brand-title">Table ordering</h1>
          <p className="brand-subtitle">Join your table session and place items from your phone.</p>
        </div>
        <InstallAppButton />
      </header>

      <main className="mobile-main guest-main">{children}</main>

      <footer className="guest-footer">
        <Link href="/" className="guest-footer-link">
          Operations home
        </Link>
      </footer>
    </div>
  );
}
