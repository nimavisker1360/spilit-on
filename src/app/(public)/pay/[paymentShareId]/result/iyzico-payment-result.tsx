"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { centsToDecimalString, formatTryCurrency, toCents } from "@/lib/currency";

type PaymentSessionStatus = "OPEN" | "PARTIALLY_PAID" | "PAID" | "FAILED" | "EXPIRED";
type PaymentShareStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED" | "CANCELLED";

type PaymentShare = {
  id: string;
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

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("tr-TR");
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

function statusLabel(status: PaymentShareStatus | PaymentSessionStatus) {
  if (status === "PAID") {
    return "Odeme basarili";
  }

  if (status === "PENDING") {
    return "Odeme isleniyor";
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return "Odeme basarisiz";
  }

  if (status === "PARTIALLY_PAID") {
    return "Kismi odendi";
  }

  return "Odenmedi";
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
  const [state, setState] = useState<PaymentResultState | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState(initialStatus === "failed" ? "Odeme basarisiz." : "");

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }

    try {
      const result = await fetchPaymentResult(paymentShareId);
      setState(result);

      if (result.paymentShare.status === "PAID") {
        setMessage(result.paymentSession.status === "PAID" ? "Odeme basarili. Hesap kapandi." : "Odeme basarili.");
        setError("");
      } else if (result.paymentShare.status === "FAILED" || result.paymentShare.status === "CANCELLED") {
        setMessage("Odeme basarisiz.");
      } else if (result.paymentShare.status === "PENDING") {
        setMessage("Odeme isleniyor.");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Odeme sonucu alinamadi.");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [paymentShareId]);

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
    setMessage("Odeme isleniyor.");

    try {
      const response = await fetch(`/api/payment-shares/${encodeURIComponent(paymentShareId)}/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ tip: share.tip || "0.00" })
      });
      const json = (await response.json()) as StartPaymentResponse;

      if (!response.ok || !json.data?.paymentPageUrl) {
        throw new Error(json.error || "Kart odemesi baslatilamadi.");
      }

      window.location.assign(json.data.paymentPageUrl);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Kart odemesi baslatilamadi.");
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

  return (
    <div className="stack-md">
      <section className="panel dashboard-hero stack-md">
        <div className="section-head">
          <div className="dashboard-hero-copy">
            <p className="section-kicker">iyzico</p>
            <h2>
              {paymentShare?.status === "PAID"
                ? paymentSession?.status === "PAID"
                  ? "Hesap kapandi"
                  : "Odeme basarili"
                : paymentShare?.status === "PENDING"
                  ? "Odeme isleniyor"
                  : "Odeme basarisiz"}
            </h2>
            <p className="panel-subtitle">
              {paymentSession?.session?.table ? `Masa ${paymentSession.session.table.name}` : "Odeme sonucu"} guncelleniyor.
            </p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading}>
            Yenile
          </button>
        </div>

        <div className="status-stack">
          {loading ? <p className="status-banner is-neutral">Odeme isleniyor.</p> : null}
          {message ? <p className="status-banner is-success">{message}</p> : null}
          {error ? <p className="status-banner is-error">{error}</p> : null}
        </div>
      </section>

      {paymentShare && paymentSession ? (
        <section className="panel stack-md">
          <div className="section-head">
            <div className="section-copy">
              <h3>{paymentShare.payerLabel}</h3>
              <p className="helper-text">Kart odemesi sonucu backend tarafinda dogrulandi.</p>
            </div>
            <span className={`badge ${statusBadgeClass(paymentShare.status)}`}>{statusLabel(paymentShare.status)}</span>
          </div>

          <div className="detail-grid">
            <div className="detail-card">
              <span className="detail-label">Pay tutari</span>
              <span className="detail-value">{formatTryCurrency(paymentShare.amount)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Bahsis</span>
              <span className="detail-value">{formatTryCurrency(paymentShare.tip)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Toplam odeme</span>
              <span className="detail-value">{formatTryCurrency(totalCharge)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Kalan tutar</span>
              <span className="detail-value">{formatTryCurrency(paymentSession.remainingAmount)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Hesap durumu</span>
              <span className="detail-value">{paymentSession.status === "PAID" ? "Hesap kapandi" : statusLabel(paymentSession.status)}</span>
            </div>
          </div>

          {paymentShare.paidAt ? <p className="meta">Odendi {formatDateTime(paymentShare.paidAt)}</p> : null}

          {paymentShare.status === "FAILED" || paymentShare.status === "CANCELLED" ? (
            <div className="ticket-actions">
              <button type="button" className="ticket-action-btn" onClick={() => void retryPayment()} disabled={retrying}>
                {retrying ? "Odeme isleniyor" : "Tekrar dene"}
              </button>
            </div>
          ) : null}

          {tableCode ? (
            <Link className="checkout-link" href={`/guest/${encodeURIComponent(tableCode)}/payment`}>
              Hesaba geri don
            </Link>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
