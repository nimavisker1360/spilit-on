"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useDashboardLanguage } from "@/components/layout/dashboard-language";
import { centsToDecimalString, formatTryCurrency, toCents } from "@/lib/currency";

type PaymentSessionStatus = "OPEN" | "PARTIALLY_PAID" | "PAID" | "FAILED" | "EXPIRED";
type PaymentShareStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED" | "CANCELLED";

type PaymentShare = {
  id: string;
  guestId: string | null;
  payerLabel: string;
  amount: string;
  tip: string;
  status: PaymentShareStatus;
  paymentUrl: string | null;
  provider: string | null;
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
    table: {
      id: string;
      name: string;
      code: string;
    } | null;
  } | null;
};

type PaymentResultState = {
  paymentSession: PaymentSession;
  paymentShare: PaymentShare;
};

type PaymentResultResponse = {
  data?: PaymentResultState;
  error?: string;
};

type StartPaymentResponse = {
  data?: {
    message: string;
    paymentPageUrl?: string;
  };
  error?: string;
};

type Props = {
  paymentShareId: string;
  initialStatus?: string;
  initialError?: string;
};

function normalizeTipAmount(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";

  if (!trimmed || !/^\d+\.\d{2}$/.test(trimmed)) {
    return "0.00";
  }

  return trimmed;
}

function normalizeReturnedPaymentError(value: string, locale: "tr" | "en"): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("[{") || trimmed.includes('"code": "invalid_') || trimmed.includes('"path": ["tip"]')) {
    return locale === "tr" ? "Odeme tamamlanamadi. Lutfen tekrar deneyin." : "Payment could not be completed. Please try again.";
  }

  return trimmed;
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

async function fetchPaymentResult(paymentShareId: string): Promise<PaymentResultState> {
  const response = await fetch(`/api/payment-shares/${encodeURIComponent(paymentShareId)}/result`, {
    cache: "no-store"
  });
  const json = (await response.json()) as PaymentResultResponse;

  if (!response.ok || !json.data) {
    throw new Error(json.error || "Odeme sonucu alinamadi.");
  }

  return json.data;
}

export function IyzicoPaymentResult({ paymentShareId, initialStatus = "", initialError = "" }: Props) {
  const { locale, t } = useDashboardLanguage();
  const router = useRouter();
  const [state, setState] = useState<PaymentResultState | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState(normalizeReturnedPaymentError(initialError, locale));
  const [message, setMessage] = useState(initialStatus === "failed" ? t("Payment failed.", "Odeme basarisiz.") : "");
  const formatDateTime = useCallback((value: string) => new Date(value).toLocaleString(locale === "tr" ? "tr-TR" : "en-US"), [locale]);
  const statusLabel = useCallback(
    (status: PaymentShareStatus | PaymentSessionStatus) => {
      if (status === "PAID") return t("Payment successful", "Odeme basarili");
      if (status === "PENDING") return t("Payment processing", "Odeme isleniyor");
      if (status === "FAILED" || status === "CANCELLED") return t("Payment failed", "Odeme basarisiz");
      if (status === "PARTIALLY_PAID") return t("Partially paid", "Kismen odendi");
      return t("Unpaid", "Odenmedi");
    },
    [t]
  );

  useEffect(() => {
    setError(normalizeReturnedPaymentError(initialError, locale));
    setMessage(initialStatus === "failed" ? t("Payment failed.", "Odeme basarisiz.") : "");
  }, [initialError, initialStatus, locale, t]);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }

    try {
      const result = await fetchPaymentResult(paymentShareId);
      setState(result);

      if (result.paymentShare.status === "PAID") {
        setMessage(
          result.paymentSession.status === "PAID"
            ? t("Payment successful. Bill closed.", "Odeme basarili. Hesap kapandi.")
            : t("Payment successful.", "Odeme basarili.")
        );
        setError("");
      } else if (result.paymentShare.status === "FAILED" || result.paymentShare.status === "CANCELLED") {
        setMessage(t("Payment failed.", "Odeme basarisiz."));
      } else if (result.paymentShare.status === "PENDING") {
        setMessage(t("Payment processing.", "Odeme isleniyor."));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("Payment result could not be loaded.", "Odeme sonucu alinamadi."));
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [paymentShareId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (state?.paymentShare.status && state.paymentShare.status !== "PENDING") {
      return;
    }

    const intervalId = window.setInterval(() => {
      void load({ silent: true });
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [load, state?.paymentShare.status]);

  async function retryPayment() {
    const share = state?.paymentShare;

    if (!share || share.status === "PAID" || share.status === "PENDING") {
      return;
    }

    setRetrying(true);
    setError("");
    setMessage(t("Payment processing.", "Odeme isleniyor."));

    try {
      const response = await fetch(`/api/payment-shares/${encodeURIComponent(paymentShareId)}/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ tip: normalizeTipAmount(share.tip) })
      });
      const json = (await response.json()) as StartPaymentResponse;

      if (!response.ok || !json.data?.paymentPageUrl) {
        throw new Error(json.error || t("Card payment could not be started.", "Kart odemesi baslatilamadi."));
      }

      window.location.assign(json.data.paymentPageUrl);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : t("Card payment could not be started.", "Kart odemesi baslatilamadi."));
      setRetrying(false);
    }
  }

  const paymentShare = state?.paymentShare ?? null;
  const paymentSession = state?.paymentSession ?? null;
  const totalCharge = useMemo(() => {
    if (!paymentShare) {
      return "0.00";
    }

    return centsToDecimalString(toCents(paymentShare.amount) + toCents(paymentShare.tip));
  }, [paymentShare]);
  const tableCode = paymentSession?.session?.table?.code ?? "";
  const shouldReturnToGuestPayment = Boolean(paymentShare?.status === "PAID" && tableCode);
  const guestPaymentHref = tableCode ? `/guest/${encodeURIComponent(tableCode)}/payment` : "";
  const retryGuestPaymentHref =
    tableCode && paymentShare
      ? `/guest/${encodeURIComponent(tableCode)}/payment?handoff=retry&step=payment${
          paymentShare.guestId ? `&guestId=${encodeURIComponent(paymentShare.guestId)}` : ""
        }&paymentStatus=failed`
      : "";

  useEffect(() => {
    if (!shouldReturnToGuestPayment || !guestPaymentHref) {
      return;
    }

    router.replace(guestPaymentHref);
  }, [guestPaymentHref, router, shouldReturnToGuestPayment]);

  useEffect(() => {
    if (!retryGuestPaymentHref || !paymentShare || (paymentShare.status !== "FAILED" && paymentShare.status !== "CANCELLED")) {
      return;
    }

    router.replace(retryGuestPaymentHref);
  }, [paymentShare, retryGuestPaymentHref, router]);

  return (
    <div className="stack-md">
      <section className="panel dashboard-hero stack-md">
        <div className="section-head">
          <div className="dashboard-hero-copy">
            <p className="section-kicker">iyzico</p>
            <h2>
              {paymentShare?.status === "PAID"
                ? paymentSession?.status === "PAID"
                  ? t("Bill closed", "Hesap kapandi")
                  : t("Payment successful", "Odeme basarili")
                : paymentShare?.status === "PENDING"
                  ? t("Payment processing", "Odeme isleniyor")
                  : t("Payment failed", "Odeme basarisiz")}
            </h2>
            <p className="panel-subtitle">
              {paymentSession?.session?.table
                ? t(`Table ${paymentSession.session.table.name} is updating.`, `Masa ${paymentSession.session.table.name} guncelleniyor.`)
                : t("Payment result is updating.", "Odeme sonucu guncelleniyor.")}
            </p>
          </div>
        </div>

        <div className="status-stack">
          {loading ? <p className="status-banner is-neutral">{t("Payment processing.", "Odeme isleniyor.")}</p> : null}
          {message ? <p className="status-banner is-success">{message}</p> : null}
          {error ? <p className="status-banner is-error">{error}</p> : null}
        </div>
      </section>

      {paymentShare && paymentSession ? (
        <section className="panel stack-md">
          <div className="section-head">
            <div className="section-copy">
              <h3>{paymentShare.payerLabel}</h3>
              <p className="helper-text">{t("The card payment result was verified by the backend.", "Kart odemesi sonucu backend tarafinda dogrulandi.")}</p>
            </div>
            <span className={`badge ${statusBadgeClass(paymentShare.status)}`}>{statusLabel(paymentShare.status)}</span>
          </div>

          <div className="detail-grid">
            <div className="detail-card">
              <span className="detail-label">{t("Base share", "Pay tutari")}</span>
              <span className="detail-value">{formatTryCurrency(paymentShare.amount)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">{t("Tip", "Bahsis")}</span>
              <span className="detail-value">{formatTryCurrency(paymentShare.tip)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">{t("Total payment", "Toplam odeme")}</span>
              <span className="detail-value">{formatTryCurrency(totalCharge)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">{t("Remaining amount", "Kalan tutar")}</span>
              <span className="detail-value">{formatTryCurrency(paymentSession.remainingAmount)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">{t("Bill status", "Hesap durumu")}</span>
              <span className="detail-value">{paymentSession.status === "PAID" ? t("Bill closed", "Hesap kapandi") : statusLabel(paymentSession.status)}</span>
            </div>
          </div>

          {paymentShare.paidAt ? <p className="meta">{t("Paid", "Odendi")} {formatDateTime(paymentShare.paidAt)}</p> : null}

          {paymentShare.status === "FAILED" || paymentShare.status === "CANCELLED" ? (
            <div className="ticket-actions">
              <button type="button" className="ticket-action-btn" onClick={() => void retryPayment()} disabled={retrying}>
                {retrying ? t("Payment processing", "Odeme isleniyor") : t("Try again", "Tekrar dene")}
              </button>
            </div>
          ) : null}

          {tableCode ? (
            <div className="ticket-actions">
              <Link className="checkout-link" href={guestPaymentHref}>
                {t("Back to bill", "Hesaba geri don")}
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
