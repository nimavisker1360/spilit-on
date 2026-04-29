"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useDashboardLanguage } from "@/components/layout/dashboard-language";
import { type FeatureAccess } from "@/features/billing/feature-gate.types";
import {
  PRO_PLAN_FEATURE_ITEMS,
  PRO_PLAN_NAME,
  PRO_PLAN_PERIOD_LABEL,
  PRO_PLAN_PRICE_LABEL,
  TRIAL_DURATION_DAYS,
} from "@/features/billing/plan-config";

type BillingData = {
  featureAccess: FeatureAccess;
  restaurant: {
    name: string;
    trialStartedAt: string | null;
    trialEndsAt: string | null;
  };
};

type TranslateFn = (english: string, turkish: string) => string;

function getTrialDaysRemaining(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;

  const endDate = new Date(trialEndsAt);
  const now = new Date();
  const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return Math.max(0, daysRemaining);
}

function formatDate(dateStr: string | null, locale: "en" | "tr", t: TranslateFn): string {
  if (!dateStr) return t("N/A", "Yok");

  return new Date(dateStr).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function getTrialProgress(daysRemaining: number | null): number {
  if (daysRemaining === null) return 0;

  return Math.min(100, Math.max(0, ((TRIAL_DURATION_DAYS - daysRemaining) / TRIAL_DURATION_DAYS) * 100));
}

function getLocalizedTrialLabel(t: TranslateFn): string {
  return t("10-day free trial", "10 gun ucretsiz deneme");
}

function getLocalizedTrialPricingLabel(t: TranslateFn): string {
  return t(`10 days free, then ${PRO_PLAN_PRICE_LABEL}/month`, `10 gun ucretsiz, sonra aylik ${PRO_PLAN_PRICE_LABEL}`);
}

function getTrialStatusCopy(
  status: FeatureAccess["status"],
  trialDaysRemaining: number | null,
  t: TranslateFn
): string {
  const trialLabel = getLocalizedTrialLabel(t);

  if (status === "trial") {
    return trialDaysRemaining === null
      ? t(`${trialLabel} is active.`, `${trialLabel} aktif.`)
      : t(
          `${trialDaysRemaining} day${trialDaysRemaining === 1 ? "" : "s"} remaining in your ${trialLabel.toLowerCase()}.`,
          `${trialLabel} icin ${trialDaysRemaining} gun kaldi.`
        );
  }

  if (status === "expired_trial") {
    return t(
      `Your ${trialLabel.toLowerCase()} has ended. Activate ${PRO_PLAN_NAME} to continue using premium features.`,
      `${trialLabel} bitti. Premium ozellikleri kullanmaya devam etmek icin ${PRO_PLAN_NAME} planini etkinlestirin.`
    );
  }

  if (status === "active") {
    return t(
      `${PRO_PLAN_NAME} is active and all premium features are unlocked.`,
      `${PRO_PLAN_NAME} aktif ve tum premium ozellikler acik.`
    );
  }

  return t(
    `Activate ${PRO_PLAN_NAME} to unlock premium features.`,
    `Premium ozellikleri acmak icin ${PRO_PLAN_NAME} planini etkinlestirin.`
  );
}

function getStatusConfig(status: FeatureAccess["status"], t: TranslateFn) {
  return {
    trial: { badge: t("Trial", "Deneme"), color: "badge-neutral" },
    active: { badge: t("Pro Active", "Pro Aktif"), color: "badge" },
    expired_trial: { badge: t("Trial Expired", "Deneme Bitti"), color: "badge-danger" },
    past_due: { badge: t("Past Due", "Gecikmis"), color: "badge-danger" },
    cancelled: { badge: t("Cancelled", "Iptal"), color: "badge-danger" },
    no_subscription: { badge: t("No Subscription", "Abonelik Yok"), color: "badge-danger" }
  }[status] ?? { badge: t("No Subscription", "Abonelik Yok"), color: "badge-danger" };
}

function getFeatureLabel(featureKey: string, t: TranslateFn): string {
  switch (featureKey) {
    case "qrOrdering":
      return t("QR Menu", "QR Menu");
    case "splitBill":
      return t("Split Payment", "Bolunmus Odeme");
    case "onlinePayments":
      return t("Online Payment", "Online Odeme");
    case "kitchenDisplay":
      return t("Kitchen Display", "Mutfak Ekrani");
    case "staffManagement":
      return t("Staff Management", "Personel Yonetimi");
    case "cashierPanel":
      return t("Cashier Panel", "Kasiyer Paneli");
    case "tableManagement":
      return t("Table Management", "Masa Yonetimi");
    case "menuManagement":
      return t("Menu Management", "Menu Yonetimi");
    case "basicAnalytics":
      return t("Basic Analytics", "Temel Analitik");
    case "pwaAccess":
      return t("PWA Access", "PWA Erisimi");
    default:
      return featureKey;
  }
}

export default function BillingPage() {
  const searchParams = useSearchParams();
  const { locale, t } = useDashboardLanguage();
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [isActivating, setIsActivating] = useState(false);

  useEffect(() => {
    async function fetchBillingData() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/admin/billing");

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.error || t("Failed to load billing data", "Faturalama verisi yuklenemedi"));
        }

        const result = await response.json();
        setData(result.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("An error occurred", "Bir hata olustu"));
      } finally {
        setLoading(false);
      }
    }

    fetchBillingData();
  }, [t]);

  const callbackError = useMemo(() => {
    if (searchParams?.get("activation") !== "failed") {
      return null;
    }

    return searchParams?.get("error") || t("Payment could not be completed. Please try again.", "Odeme tamamlanamadi. Lutfen tekrar deneyin.");
  }, [searchParams, t]);

  async function handleActivateProPlan() {
    try {
      setIsActivating(true);
      setActivationError(null);
      const response = await fetch("/api/admin/billing/activate", {
        method: "POST"
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || t("Payment could not be started.", "Odeme baslatilamadi."));
      }

      const paymentPageUrl = payload?.data?.paymentPageUrl;
      const redirectUrl = payload?.data?.redirectUrl;

      if (typeof paymentPageUrl === "string" && paymentPageUrl) {
        window.location.assign(paymentPageUrl);
        return;
      }

      if (typeof redirectUrl === "string" && redirectUrl) {
        window.location.assign(redirectUrl);
        return;
      }

      throw new Error(t("Payment response is incomplete.", "Odeme yaniti eksik."));
    } catch (err) {
      setActivationError(err instanceof Error ? err.message : t("Payment could not be started.", "Odeme baslatilamadi."));
      setIsActivating(false);
    }
  }

  if (loading) {
    return (
      <div className="billing-page">
        <section className="billing-panel billing-loading">
          <p>{t("Loading billing information...", "Faturalama bilgileri yukleniyor...")}</p>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="billing-page">
        <div className="status-banner is-error">{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="billing-page">
        <section className="billing-panel billing-loading">
          <p>{t("No billing data available", "Faturalama verisi bulunamadi")}</p>
        </section>
      </div>
    );
  }

  const { featureAccess, restaurant } = data;
  const trialDaysRemaining = getTrialDaysRemaining(restaurant.trialEndsAt);
  const statusConfig = getStatusConfig(featureAccess.status, t);
  const trialProgress = getTrialProgress(trialDaysRemaining);
  const trialStatusCopy = getTrialStatusCopy(featureAccess.status, trialDaysRemaining, t);
  const localizedTrialLabel = getLocalizedTrialLabel(t);
  const localizedTrialPricingLabel = getLocalizedTrialPricingLabel(t);
  const isAlreadyActive = featureAccess.status === "active";
  const activateButtonLabel = isAlreadyActive
    ? t("Pro plan is active", "Pro plani aktif")
    : isActivating
      ? t("Redirecting to iyzico...", "iyzico'ya yonlendiriliyor...")
      : t("Activate Pro Plan", "Pro Plani Etkinlestir");

  return (
    <div className="billing-page">
      {callbackError ? <div className="status-banner is-error">{callbackError}</div> : null}
      {activationError ? <div className="status-banner is-error">{activationError}</div> : null}

      <section className="billing-hero">
        <div className="billing-hero-copy">
          <span className="section-kicker">{t("Billing", "Faturalama")}</span>
          <h2>{t("Current plan and trial", "Mevcut plan ve deneme")}</h2>
          <p>{trialStatusCopy}</p>
        </div>

        <div className="billing-hero-meter">
          <div>
            <span>{t("Trial remaining", "Kalan deneme")}</span>
            <strong>
              {featureAccess.status === "trial" && trialDaysRemaining !== null
                ? t(
                    `${trialDaysRemaining} day${trialDaysRemaining === 1 ? "" : "s"}`,
                    `${trialDaysRemaining} gun`
                  )
                : featureAccess.status === "active"
                  ? t("Converted", "Aktif")
                  : t("Expired", "Bitti")}
            </strong>
          </div>
          <div className="billing-progress" aria-hidden="true">
            <span style={{ width: `${trialProgress}%` }} />
          </div>
          <small>{localizedTrialLabel}</small>
        </div>
      </section>

      <section className="billing-panel">
        <div className="billing-section-head">
          <div>
            <span className="section-kicker">{t("Status", "Durum")}</span>
            <h3>{t("Current Billing Status", "Guncel Faturalama Durumu")}</h3>
          </div>
          <span className={`badge ${statusConfig.color}`}>{statusConfig.badge}</span>
        </div>

        <div className="billing-status-grid">
          <div className="billing-stat">
            <span>{t("Restaurant", "Restoran")}</span>
            <strong>{restaurant.name}</strong>
          </div>
          <div className="billing-stat">
            <span>{t("Current Plan", "Mevcut Plan")}</span>
            <strong>{featureAccess.plan?.name || PRO_PLAN_NAME}</strong>
          </div>
          <div className="billing-stat">
            <span>{t("Trial Offer", "Deneme Teklifi")}</span>
            <strong>{localizedTrialLabel}</strong>
          </div>
          <div className="billing-stat">
            <span>{t("Trial Started", "Deneme Basladi")}</span>
            <strong>{formatDate(restaurant.trialStartedAt, locale, t)}</strong>
          </div>
          <div className="billing-stat">
            <span>{t("Trial Ends", "Deneme Bitisi")}</span>
            <strong>{formatDate(restaurant.trialEndsAt, locale, t)}</strong>
          </div>
        </div>
      </section>

      <section className="billing-pro-card">
        <div className="billing-pro-copy">
          <span className="section-kicker">{localizedTrialLabel}</span>
          <h3>{PRO_PLAN_NAME}</h3>
          <div className="billing-price">
            {PRO_PLAN_PRICE_LABEL}
            <span>{PRO_PLAN_PERIOD_LABEL}</span>
          </div>
          <p>{localizedTrialPricingLabel}</p>
          <p>{t("Sandbox payment opens in iyzico and returns here automatically after a successful card payment.", "Sandbox odemesi iyzico'da acilir ve basarili kart odemesinden sonra sizi otomatik olarak panele geri getirir.")}</p>
          <button
            type="button"
            onClick={handleActivateProPlan}
            disabled={isAlreadyActive || isActivating}
          >
            {activateButtonLabel}
          </button>
        </div>

        <ul className="billing-feature-grid">
          {PRO_PLAN_FEATURE_ITEMS.map((feature) => {
            const enabled = featureAccess.features[feature.key];

            return (
              <li key={feature.key} className={enabled ? "is-enabled" : "is-locked"}>
                <span>{enabled ? "\u2713" : "\u00D7"}</span>
                {getFeatureLabel(feature.key, t)}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="billing-panel">
        <div className="billing-section-head">
          <div>
            <span className="section-kicker">{t("Access", "Erisim")}</span>
            <h3>{t("Current Access", "Guncel Erisim")}</h3>
          </div>
          <span className={featureAccess.isPremiumLocked ? "badge badge-danger" : "badge"}>
            {featureAccess.isPremiumLocked ? t("Premium Locked", "Premium Kilitli") : t("All Pro Features", "Tum Pro Ozellikleri")}
          </span>
        </div>

        <div className="billing-access-layout">
          <div className="billing-access-list">
            {PRO_PLAN_FEATURE_ITEMS.map((feature) => (
              <span key={feature.key} className={featureAccess.features[feature.key] ? "is-enabled" : "is-locked"}>
                {featureAccess.features[feature.key] ? "\u2713" : "\u00D7"} {getFeatureLabel(feature.key, t)}
              </span>
            ))}
          </div>

          <div className="billing-limit-grid">
            <div>
              <span>{t("Branches", "Subeler")}</span>
              <strong>{featureAccess.usage.branches}/{featureAccess.limits.maxBranches}</strong>
            </div>
            <div>
              <span>{t("Tables", "Masalar")}</span>
              <strong>{featureAccess.usage.tables}/{featureAccess.limits.maxTables}</strong>
            </div>
            <div>
              <span>{t("Staff", "Personel")}</span>
              <strong>{featureAccess.usage.staff}/{featureAccess.limits.maxStaff}</strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
