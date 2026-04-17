import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { env } from "@/lib/env";
import { PRIMARY_NAV_LINKS } from "@/lib/navigation";

export default function HomePage() {
  const links = [
    { href: "/admin", title: "Admin dashboard", description: "Branch, table, menu, and QR table tokens" },
    { href: "/waiter", title: "Waiter dashboard", description: "Open sessions and place floor orders" },
    { href: "/kitchen", title: "Kitchen board", description: "Track ticket items by prep stage" },
    { href: "/cashier", title: "Cashier invoice", description: "Calculate full/equal/by-guest split bills" }
  ];

  return (
    <AppShell title="SplitTable" subtitle="Restaurant Ops PWA" navLinks={PRIMARY_NAV_LINKS}>
      <div className="stack-md">
        <section className="hero-card">
          <p className="eyebrow">Production-ready MVP</p>
          <h2>Next.js PWA for restaurant operations</h2>
          <p>
            No complex auth for MVP. Dashboards are open internally, and customer access is via QR table URL.
            Local development now persists business data inside the workspace, so the app stays usable without a remote database.
          </p>
          <div className="code-pill-row">
            <code>{env.NEXT_PUBLIC_APP_URL}/table/&lt;token&gt;</code>
          </div>
        </section>

        <section className="grid-cards">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="action-card">
              <h3>{link.title}</h3>
              <p>{link.description}</p>
            </Link>
          ))}
        </section>

        <section className="panel">
          <h3>Bootstrap the first branch</h3>
          <p>
            Use <code>POST /api/seed</code> once if you want to restore the default restaurant, branch, tables, and menu.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
