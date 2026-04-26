"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useDashboardLanguage } from "@/components/layout/dashboard-language";
import { centsToDecimalString, formatTryCurrency, toCents } from "@/lib/currency";

type PaymentSessionStatus = "OPEN" | "PARTIALLY_PAID" | "PAID" | "FAILED" | "EXPIRED";
type PaymentShareStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED" | "CANCELLED";

type PaymentShare = {
  id: string;
  userId: string | null;
  guestId: string | null;
  payerLabel: string;
  amount: string;
  tip: string;
  status: PaymentShareStatus;
  provider: string | null;
  paymentUrl: string | null;
  paidAt: string | null;
};

type PaymentSession = {
  id: string;
  status: PaymentSessionStatus;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  session: {
    id: string;
    status: "OPEN" | "CLOSED";
    closedAt: string | null;
    readyToCloseAt: string | null;
    totalAmount: string;
    paidAmount: string;
    remainingAmount: string;
    table: {
      id: string;
      name: string;
      code: string;
    } | null;
  } | null;
};

type PaymentLinkState = {
  paymentSession: PaymentSession;
  paymentShare: PaymentShare;
};

type PaymentLinkResponse = {
  data?: PaymentLinkState;
  error?: string;
};

type Props = {
  paymentShareId: string;
  token: string;
  tipAmount?: string;
};

function normalizeTipAmount(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return null;
  }

  try {
    return centsToDecimalString(toCents(trimmed));
  } catch {
    return null;
  }
}

function statusBadgeClass(status: PaymentShareStatus) {
  if (status === "PAID") {
    return "badge-status-paid-payment";
  }

  if (status === "PENDING") {
    return "badge-status-pending-payment";
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return "badge-danger";
  }

  return "badge-status-unpaid";
}

export function MockPaymentExperience({ paymentShareId, token, tipAmount = "" }: Props) {
  const { locale, t } = useDashboardLanguage();
  const [state, setState] = useState<PaymentLinkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningAction, setRunningAction] = useState<"COMPLETE" | "FAIL" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const normalizedTipAmount = useMemo(() => normalizeTipAmount(tipAmount), [tipAmount]);
  const formatDateTime = useCallback((value: string) => new Date(value).toLocaleString(locale === "tr" ? "tr-TR" : "en-US"), [locale]);
  const formatStatusLabel = useCallback(
    (value: string) => {
      if (value === "OPEN") return t("Open", "Acik");
      if (value === "PARTIALLY_PAID") return t("Partially paid", "Kismen odendi");
      if (value === "PAID") return t("Paid", "Odendi");
      if (value === "FAILED") return t("Failed", "Basarisiz");
      if (value === "EXPIRED") return t("Expired", "Suresi doldu");
      if (value === "UNPAID") return t("Unpaid", "Odenmedi");
      if (value === "PENDING") return t("Pending", "Isleniyor");
      if (value === "CANCELLED") return t("Cancelled", "Iptal edildi");
      return value;
    },
    [t]
  );

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!token) {
      setError(t("Missing payment link.", "Odeme linki eksik."));
      setLoading(false);
      return;
    }

    if (!options?.silent) {
      setLoading(true);
    }
    setError("");

    try {
      const response = await fetch(`/api/payment-links/${encodeURIComponent(paymentShareId)}?token=${encodeURIComponent(token)}`, {
        cache: "no-store"
      });
      const json = (await response.json()) as PaymentLinkResponse;

      if (!response.ok || !json.data) {
        throw new Error(json.error || t("Failed to load payment link.", "Odeme linki yuklenemedi."));
      }

      setState(json.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("Failed to load payment link.", "Odeme linki yuklenemedi."));
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [paymentShareId, t, token]);

  useEffect(() => {
    void load();
    const intervalId = window.setInterval(() => {
      void load({ silent: true });
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [load]);

  async function handleAction(action: "COMPLETE" | "FAIL") {
    if (!token) {
      return;
    }

    setError("");
    setMessage("");
    setRunningAction(action);

    try {
      const response = await fetch(
        `/api/payment-links/${encodeURIComponent(paymentShareId)}/action?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ action, tip: normalizedTipAmount ?? "0.00" })
        }
      );
      const json = (await response.json()) as PaymentLinkResponse;

      if (!response.ok || !json.data) {
        throw new Error(json.error || t("Mock payment action failed.", "Demo odeme islemi basarisiz oldu."));
      }

      setState(json.data);
      setMessage(
        action === "COMPLETE"
          ? normalizedTipAmount && toCents(normalizedTipAmount) > 0
            ? t("Payment completed with tip.", "Odeme bahsis ile tamamlandi.")
            : t("Payment completed.", "Odeme tamamlandi.")
          : t("Payment marked as failed.", "Odeme basarisiz olarak isaretlendi.")
      );

      const tableCode = json.data.paymentSession.session?.table?.code;
      if (action === "COMPLETE" && json.data.paymentShare.status === "PAID" && tableCode) {
        window.location.assign(`/guest/${encodeURIComponent(tableCode)}/payment`);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t("Mock payment action failed.", "Demo odeme islemi basarisiz oldu."));
    } finally {
      setRunningAction(null);
    }
  }

  const paymentShare = state?.paymentShare ?? null;
  const paymentSession = state?.paymentSession ?? null;
  const activeTipAmount = paymentShare ? normalizedTipAmount ?? paymentShare.tip : "0.00";
  const totalChargeAmount = paymentShare ? centsToDecimalString(toCents(paymentShare.amount) + toCents(activeTipAmount)) : null;

  return (
    <div className="stack-md">
      <section className="panel dashboard-hero stack-md">
        <div className="section-head">
          <div className="dashboard-hero-copy">
            <p className="section-kicker">{t("Secure payment step", "Guvenli odeme adimi")}</p>
            <h2>{paymentSession?.session?.table ? t(`Table ${paymentSession.session.table.name}`, `Masa ${paymentSession.session.table.name}`) : t("Payment request", "Odeme talebi")}</h2>
            <p className="panel-subtitle">
              {t(
                "This demo simulates the final Turkey payment handoff before a real iyzico / PayTR / card provider is connected.",
                "Bu demo, gercek iyzico / PayTR / kart saglayicisi baglanmadan onceki son Turkiye odeme yonlendirmesini simule eder."
              )}
            </p>
            <div className="badge-row">
              <span className="badge badge-outline">iyzico</span>
              <span className="badge badge-outline">PayTR</span>
              <span className="badge badge-outline">{t("Bank card", "Banka karti")}</span>
              {normalizedTipAmount && toCents(normalizedTipAmount) > 0 ? (
                <span className="badge badge-neutral">{t("Tip", "Bahsis")} {formatTryCurrency(normalizedTipAmount)}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="status-stack">
          {loading ? <p className="status-banner is-neutral">{t("Loading payment details.", "Odeme detaylari yukleniyor.")}</p> : null}
          {error ? <p className="status-banner is-error">{error}</p> : null}
          {message ? <p className="status-banner is-success">{message}</p> : null}
        </div>
      </section>

      {paymentShare && paymentSession ? (
        <section className="panel stack-md">
          <div className="section-head">
            <div className="section-copy">
              <h3>{paymentShare.payerLabel}</h3>
              <p className="helper-text">{t("Amount to be collected for this payment request.", "Bu odeme talebi icin tahsil edilecek tutar.")}</p>
            </div>
            <span className={`badge ${statusBadgeClass(paymentShare.status)}`}>{formatStatusLabel(paymentShare.status)}</span>
          </div>

          <div className="detail-grid">
            <div className="detail-card">
              <span className="detail-label">{t("Base share", "Ana pay")}</span>
              <span className="detail-value">{formatTryCurrency(paymentShare.amount)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">{t("Selected tip", "Secilen bahsis")}</span>
              <span className="detail-value">
                {toCents(activeTipAmount) > 0 ? formatTryCurrency(activeTipAmount) : t("No tip", "Bahsis yok")}
              </span>
            </div>
            <div className="detail-card">
              <span className="detail-label">{t("Total charge", "Toplam tahsilat")}</span>
              <span className="detail-value">{formatTryCurrency(totalChargeAmount ?? paymentShare.amount)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">{t("Bill remaining", "Kalan hesap")}</span>
              <span className="detail-value">{formatTryCurrency(paymentSession.remainingAmount)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">{t("Payment status", "Odeme durumu")}</span>
              <span className="detail-value">{formatStatusLabel(paymentSession.status)}</span>
            </div>
          </div>

          {paymentShare.paidAt ? <p className="meta">{t("Completed at", "Tamamlandi")} {formatDateTime(paymentShare.paidAt)}</p> : null}

          {paymentShare.status === "PENDING" ? (
            <div className="ticket-actions">
              <button type="button" className="ticket-action-btn" onClick={() => void handleAction("COMPLETE")} disabled={Boolean(runningAction)}>
                {runningAction === "COMPLETE" ? t("Completing...", "Tamamlaniyor...") : t("Complete payment", "Odemeyi tamamla")}
              </button>
              <button type="button" className="ticket-action-btn warn" onClick={() => void handleAction("FAIL")} disabled={Boolean(runningAction)}>
                {runningAction === "FAIL" ? t("Updating...", "Guncelleniyor...") : t("Mark as failed", "Basarisiz olarak isaretle")}
              </button>
            </div>
          ) : null}

          {paymentShare.status === "PAID" ? (
            <div className="selection-summary stack-md">
              <p>
                <strong>{t("Payment received.", "Odeme alindi.")}</strong>
              </p>
              <p className="helper-text">
                {t(
                  "Payment tracking has been updated. Once all bill shares are paid, the POS-side flow can close the table automatically.",
                  "Odeme takibi guncellendi. Tum hesap paylari odendiginde POS tarafi masayi otomatik kapatabilir."
                )}
              </p>
            </div>
          ) : null}

          {paymentShare.status === "FAILED" ? (
            <div className="selection-summary stack-md">
              <p>
                <strong>{t("Payment failed.", "Odeme basarisiz oldu.")}</strong>
              </p>
              <p className="helper-text">{t("Retry via cashier with cash, card, or a new payment link.", "Kasiyer uzerinden nakit, kart veya yeni bir odeme linki ile tekrar deneyin.")}</p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
