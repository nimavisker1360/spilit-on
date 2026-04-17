"use client";

import { useEffect, useState } from "react";

import { formatTryCurrency } from "@/lib/currency";

type PaymentSessionStatus = "OPEN" | "PARTIALLY_PAID" | "PAID" | "FAILED" | "EXPIRED";
type PaymentShareStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED" | "CANCELLED";

type PaymentShare = {
  id: string;
  payerLabel: string;
  amount: string;
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
    readyToCloseAt: string | null;
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
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("tr-TR");
}

function formatStatusLabel(value: string) {
  if (value === "OPEN") {
    return "Acik";
  }

  if (value === "PARTIALLY_PAID") {
    return "Kismi odendi";
  }

  if (value === "PAID") {
    return "Odendi";
  }

  if (value === "FAILED") {
    return "Basarisiz";
  }

  if (value === "EXPIRED") {
    return "Suresi doldu";
  }

  if (value === "UNPAID") {
    return "Odenmedi";
  }

  if (value === "PENDING") {
    return "Beklemede";
  }

  if (value === "CANCELLED") {
    return "Iptal edildi";
  }

  return value;
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

export function MockPaymentExperience({ paymentShareId, token }: Props) {
  const [state, setState] = useState<PaymentLinkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningAction, setRunningAction] = useState<"COMPLETE" | "FAIL" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    if (!token) {
      setError("Odeme baglantisi eksik.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/payment-links/${encodeURIComponent(paymentShareId)}?token=${encodeURIComponent(token)}`, {
        cache: "no-store"
      });
      const json = (await response.json()) as PaymentLinkResponse;

      if (!response.ok || !json.data) {
        throw new Error(json.error || "Odeme linki yuklenemedi.");
      }

      setState(json.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Odeme linki yuklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentShareId, token]);

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
          body: JSON.stringify({ action })
        }
      );
      const json = (await response.json()) as PaymentLinkResponse;

      if (!response.ok || !json.data) {
        throw new Error(json.error || "Mock payment action failed.");
      }

      setState(json.data);
      setMessage(action === "COMPLETE" ? "Odeme tamamlandi." : "Odeme basarisiz olarak isaretlendi.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Mock payment action failed.");
    } finally {
      setRunningAction(null);
    }
  }

  const paymentShare = state?.paymentShare ?? null;
  const paymentSession = state?.paymentSession ?? null;

  return (
    <div className="stack-md">
      <section className="panel dashboard-hero stack-md">
        <div className="section-head">
          <div className="dashboard-hero-copy">
            <p className="section-kicker">Odeme linki</p>
            <h2>{paymentSession?.session?.table ? `Masa ${paymentSession.session.table.name}` : "Odeme talebi"}</h2>
            <p className="panel-subtitle">
              Bu sayfa, gercek odeme saglayicisi baglanmadan once TRY odeme tamamlama adimini simule eder.
            </p>
          </div>
          <button type="button" onClick={() => void load()}>
            Refresh
          </button>
        </div>

        <div className="status-stack">
          {loading ? <p className="status-banner is-neutral">Odeme detaylari yukleniyor.</p> : null}
          {error ? <p className="status-banner is-error">{error}</p> : null}
          {message ? <p className="status-banner is-success">{message}</p> : null}
        </div>
      </section>

      {paymentShare && paymentSession ? (
        <section className="panel stack-md">
          <div className="section-head">
            <div className="section-copy">
              <h3>{paymentShare.payerLabel}</h3>
              <p className="helper-text">Bu odeme talebi icin tahsil edilecek tutar.</p>
            </div>
            <span className={`badge ${statusBadgeClass(paymentShare.status)}`}>{formatStatusLabel(paymentShare.status)}</span>
          </div>

          <div className="detail-grid">
            <div className="detail-card">
              <span className="detail-label">Sizin payiniz</span>
              <span className="detail-value">{formatTryCurrency(paymentShare.amount)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Odenen tutar</span>
              <span className="detail-value">{formatTryCurrency(paymentSession.paidAmount)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Kalan tutar</span>
              <span className="detail-value">{formatTryCurrency(paymentSession.remainingAmount)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Odeme durumu</span>
              <span className="detail-value">{formatStatusLabel(paymentSession.status)}</span>
            </div>
          </div>

          {paymentShare.paidAt ? <p className="meta">Completed at {formatDateTime(paymentShare.paidAt)}</p> : null}

          {paymentShare.status === "PENDING" ? (
            <div className="ticket-actions">
              <button type="button" className="ticket-action-btn" onClick={() => void handleAction("COMPLETE")} disabled={Boolean(runningAction)}>
                {runningAction === "COMPLETE" ? "Tamamlaniyor..." : "Odemeyi tamamla"}
              </button>
              <button type="button" className="ticket-action-btn warn" onClick={() => void handleAction("FAIL")} disabled={Boolean(runningAction)}>
                {runningAction === "FAIL" ? "Isaretleniyor..." : "Basarisiz isaretle"}
              </button>
            </div>
          ) : null}

          {paymentShare.status === "PAID" ? (
            <div className="selection-summary stack-md">
              <p>
                <strong>Odeme alindi.</strong>
              </p>
              <p className="helper-text">
                Kasadaki odeme takibi guncellendi. Tum paylar odendiginde masa kapatmaya hazir olur.
              </p>
            </div>
          ) : null}

          {paymentShare.status === "FAILED" ? (
            <div className="selection-summary stack-md">
              <p>
                <strong>Odeme basarisiz.</strong>
              </p>
              <p className="helper-text">Kasadan nakit, kart veya yeni bir odeme linkiyle tekrar deneyin.</p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
