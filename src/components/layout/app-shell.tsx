import Link from "next/link";

import { InstallAppButton } from "@/components/install-app-button";
import type { AppNavLink } from "@/types";

type Props = {
  children: React.ReactNode;
  navLinks?: AppNavLink[];
  title: string;
  subtitle: string;
  showInstallButton?: boolean;
};

export function AppShell({
  children,
  navLinks = [],
  title,
  subtitle,
  showInstallButton = true
}: Props) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="app-header">
        <div className="brand-wrap">
          <span className="brand-dot" />
          <div>
            <h1 className="brand-title">{title}</h1>
            <p className="brand-subtitle">{subtitle}</p>
          </div>
        </div>
        {showInstallButton ? <InstallAppButton /> : null}
      </header>

      {navLinks.length > 0 ? (
        <nav className="tab-nav" aria-label="Main Navigation">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="tab-nav-link">
              {link.label}
            </Link>
          ))}
        </nav>
      ) : null}

      <main className="app-main flex-1">{children}</main>
    </div>
  );
}
