"use client";

import Link from "next/link";
import {
  PRO_PLAN_FEATURE_ITEMS,
  PRO_PLAN_NAME,
  PRO_PLAN_PERIOD_LABEL,
  PRO_PLAN_PRICE_LABEL,
  PRO_TRIAL_PRICING_LABEL,
} from "@/features/billing/plan-config";

export function LandingPricingSection() {
  return (
    <section className="mp-section" id="fiyatlandirma">
      <div className="mp-container">
        <div className="mp-section-header mp-reveal">
          <span className="mp-kicker">Plans</span>
          <h2>Simple, Transparent Pricing</h2>
          <p className="mp-section-lead">One plan, full access. Start with a free trial, then continue on Pro.</p>
        </div>

        <article className="mp-pricing-card mp-reveal">
          <div className="mp-pricing-badge">One Plan</div>

          <div className="mp-pricing-main">
            <div className="mp-pricing-copy">
              <h3>{PRO_PLAN_NAME}</h3>
              <div className="mp-pricing-price">
                {PRO_PLAN_PRICE_LABEL}
                <span>{PRO_PLAN_PERIOD_LABEL}</span>
              </div>
              <p>{PRO_TRIAL_PRICING_LABEL}</p>
            </div>

            <div className="mp-pricing-divider" />

            <ul className="mp-pricing-features">
              {PRO_PLAN_FEATURE_ITEMS.map((feature) => (
                <li key={feature.key}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--mp-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {feature.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="mp-pricing-actions">
            <Link href="/signup" className="mp-btn mp-btn-primary">
              Start Free Trial
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}
