import Link from "next/link";

import { InstallAppButton } from "@/components/install-app-button";
import { DASHBOARD_NAV_LINKS, ROLE_LAYOUT_META } from "@/lib/navigation";
import type { AppRole } from "@/types";

type Props = {
  children: React.ReactNode;
  role: AppRole;
};

export function DashboardShell({ children, role }: Props) {
  const layoutMeta = ROLE_LAYOUT_META[role];

  return (
    <div className={`mobile-layout dashboard-shell dashboard-shell--${role}`}>
      <header className="mobile-header dashboard-header">
        <div className="brand-wrap">
          <span className="brand-dot" />
          <div>
            <h1 className="brand-title">{layoutMeta.title}</h1>
            <p className="brand-subtitle">{layoutMeta.subtitle}</p>
          </div>
        </div>
        <InstallAppButton />
      </header>

      <main className="mobile-main dashboard-main">{children}</main>

      <nav className="bottom-nav" aria-label="Dashboard Navigation">
        {DASHBOARD_NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`bottom-nav-link${link.href === layoutMeta.activeHref ? " is-active" : ""}`}
            aria-current={link.href === layoutMeta.activeHref ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
