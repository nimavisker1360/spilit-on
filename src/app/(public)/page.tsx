import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { env } from "@/lib/env";
import { PRIMARY_NAV_LINKS } from "@/lib/navigation";

export default function HomePage() {
  const workflow = [
    {
      step: "1",
      title: "Restaurant sends the bill",
      description: "The live bill appears instantly, pulled from the restaurant POS after staff send it to the table flow."
    },
    {
      step: "2",
      title: "Guests scan the table QR",
      description: "Each guest connects on their own phone, matches their name to the bill, and enters the split-payment flow."
    },
    {
      step: "3",
      title: "Split without awkward math",
      description: "Pay the full bill, split equally, or split by assigned items. The payment page stays focused on checkout, not menu browsing."
    },
    {
      step: "4",
      title: "Pay in Turkey",
      description: "Hand off to iyzico, PayTR, or card checkout. Optional tip presets can be added before payment, and the POS closes automatically once shares are settled."
    }
  ];
  const links = [
    { href: "/admin", title: "Admin dashboard", description: "Manage branches, tables, QR tokens, and customer-facing branding." },
    { href: "/waiter", title: "Waiter dashboard", description: "Open live table sessions and support floor operations." },
    { href: "/kitchen", title: "Kitchen board", description: "Track ticket items by prep stage when the branch uses ordering." },
    { href: "/cashier", title: "Cashier invoice", description: "Prepare the bill and launch full / equal / by-item split payment." }
  ];

  return (
    <AppShell
      title="SplitTable Turkey"
      subtitle="POS-linked split payment"
      navLinks={PRIMARY_NAV_LINKS}
      shellVariant="admin"
    >
      <div className="admin-page stack-md">
        <section className="admin-hero stack-md">
          <div className="section-head admin-hero-head">
            <div className="dashboard-hero-copy">
              <p className="section-kicker">Turkey payment flow</p>
              <h2>Restaurant sends the live bill. Guests scan the table QR and pay.</h2>
              <p className="panel-subtitle">
                This version shifts the guest flow away from menu-first QR ordering. For the Turkey rollout, the QR route
                starts after the bill is sent from the POS, so guests land directly in split payment on their phones.
              </p>
            </div>
          </div>

          <div className="badge-row">
            <span className="badge badge-outline">POS live bill</span>
            <span className="badge badge-outline">QR on table</span>
            <span className="badge badge-outline">Split payment</span>
            <span className="badge badge-outline">iyzico / PayTR / card</span>
          </div>
          <div className="code-pill-row">
            <code>{env.NEXT_PUBLIC_APP_URL}/table/&lt;token&gt;</code>
          </div>

          <div className="dashboard-stat-grid admin-stat-grid">
            {workflow.map((step) => (
              <article key={step.title} className="dashboard-stat-card">
                <p className="dashboard-stat-label">{step.title}</p>
                <p className="dashboard-stat-value">{step.step}</p>
                <p className="dashboard-stat-note">{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section-block">
          <div className="section-copy">
            <p className="section-kicker">Workspaces</p>
            <h3>Operations dashboards</h3>
            <p className="panel-subtitle">Jump into the same admin-style workspace used by each restaurant role.</p>
          </div>

          <div className="grid-2">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="list-item entity-card workspace-card stack-md">
                <div className="entity-top">
                  <div className="entity-title">
                    <h4>{link.title}</h4>
                    <p className="entity-summary">{link.description}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="section-block">
          <div className="section-copy">
            <p className="section-kicker">Setup</p>
            <h3>Bootstrap the first branch</h3>
            <p className="panel-subtitle">
              Use the default dataset if you want a ready-made restaurant, branch, tables, menu data, and cashier flow for
              local testing.
            </p>
          </div>

          <div className="detail-grid">
            <div className="detail-card">
              <span className="detail-label">Seed endpoint</span>
              <span className="detail-value is-mono">POST /api/seed</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Includes</span>
              <span className="detail-value">Restaurant, branch, tables, menu, cashier flow</span>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
