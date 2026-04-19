import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { env } from "@/lib/env";
import { PRIMARY_NAV_LINKS } from "@/lib/navigation";

export default function HomePage() {
  const workflow = [
    {
      title: "1. Restaurant sends the bill",
      description: "The live bill appears instantly, pulled from the restaurant POS after staff send it to the table flow."
    },
    {
      title: "2. Guests scan the table QR",
      description: "Each guest connects on their own phone, matches their name to the bill, and enters the split-payment flow."
    },
    {
      title: "3. Split without awkward math",
      description: "Pay the full bill, split equally, or split by assigned items. The payment page stays focused on checkout, not menu browsing."
    },
    {
      title: "4. Pay in Turkey",
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
    <AppShell title="SplitTable Turkey" subtitle="POS-linked split payment" navLinks={PRIMARY_NAV_LINKS}>
      <div className="stack-md">
        <section className="hero-card stack-md">
          <p className="eyebrow">Turkey payment flow</p>
          <h2>Restaurant sends the live bill. Guests scan the table QR and pay.</h2>
          <p>
            This version shifts the guest flow away from menu-first QR ordering. For the Turkey rollout, the QR route starts
            after the bill is sent from the POS, so guests land directly in split payment on their phones.
          </p>
          <div className="badge-row">
            <span className="badge badge-outline">POS live bill</span>
            <span className="badge badge-outline">QR on table</span>
            <span className="badge badge-outline">Split payment</span>
            <span className="badge badge-outline">iyzico / PayTR / card</span>
          </div>
          <div className="code-pill-row">
            <code>{env.NEXT_PUBLIC_APP_URL}/table/&lt;token&gt;</code>
          </div>
        </section>

        <section className="grid-cards">
          {workflow.map((step) => (
            <article key={step.title} className="action-card">
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </section>

        <section className="grid-cards">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="action-card">
              <h3>{link.title}</h3>
              <p>{link.description}</p>
            </Link>
          ))}
        </section>

        <section className="panel stack-md">
          <div className="section-copy">
            <h3>Bootstrap the first branch</h3>
            <p className="helper-text">
              Use the default dataset if you want a ready-made restaurant, branch, tables, menu data, and cashier flow for
              local testing.
            </p>
          </div>
          <p>
            Use <code>POST /api/seed</code> once if you want to restore the default restaurant, branch, tables, and menu.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
