"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

type Props = {
  admin: {
    name: string;
    email: string;
  };
  children: ReactNode;
};

const links = [
  { href: "/super-admin", label: "Panel", icon: "⌂" },
  { href: "/super-admin/users", label: "Kullanicilar", icon: "@" },
  { href: "/super-admin/restaurants", label: "Restoranlar", icon: "R" },
  { href: "/super-admin/subscriptions", label: "Abonelikler", icon: "S" },
  { href: "/super-admin/payments", label: "Odemeler", icon: "₺" },
  { href: "/super-admin/plans", label: "Plan", icon: "P" },
  { href: "/super-admin/settings", label: "Ayarlar", icon: "A" },
  { href: "/super-admin/audit-logs", label: "Audit", icon: "L" },
];

export function SuperAdminShell({ admin, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/super-admin/auth/logout", { method: "POST" });
    router.push("/super-admin/login");
    router.refresh();
  };

  return (
    <div className="super-admin-shell">
      <aside className="super-admin-sidebar">
        <div className="super-admin-brand">
          <span className="super-admin-brand-mark">MP</span>
          <div>
            <strong>MasaPayz</strong>
            <span>Super Admin</span>
          </div>
        </div>

        <nav className="super-admin-nav" aria-label="Super admin navigation">
          {links.map((link) => {
            const isActive = pathname === link.href || (link.href !== "/super-admin" && pathname?.startsWith(link.href));
            return (
              <Link key={link.href} href={link.href} className={isActive ? "is-active" : ""}>
                <span>{link.icon}</span>
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="super-admin-account">
          <strong>{admin.name}</strong>
          <span>{admin.email}</span>
          <button type="button" className="secondary" onClick={logout}>
            Cikis yap
          </button>
        </div>
      </aside>
      <main className="super-admin-content">{children}</main>
    </div>
  );
}
