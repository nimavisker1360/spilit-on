"use client";

import { useEffect, useState } from "react";

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

const currencyFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatCurrency(value: string) {
  return currencyFormatter.format(Number(value));
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("tr-TR");
}

function formatStatusLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
      setError("Missing mock payment token.");
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
        throw new Error(json.error || "Could not load mock payment link.");
      }

      setState(json.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load mock payment link.");
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
      setMessage(action === "COMPLETE" ? "Payment completed successfully." : "Payment was marked as failed.");
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
            <p className="section-kicker">Mock payment link</p>
            <h2>{paymentSession?.session?.table ? `Table ${paymentSession.session.table.name}` : "Payment request"}</h2>
            <p className="panel-subtitle">
              This page simulates the online payment completion step before real gateway integration.
            </p>
          </div>
          <button type="button" onClick={() => void load()}>
            Refresh
          </button>
        </div>

        <div className="status-stack">
          {loading ? <p className="status-banner is-neutral">Loading mock payment details.</p> : null}
          {error ? <p className="status-banner is-error">{error}</p> : null}
          {message ? <p className="status-banner is-success">{message}</p> : null}
        </div>
      </section>

      {paymentShare && paymentSession ? (
        <section className="panel stack-md">
          <div className="section-head">
            <div className="section-copy">
              <h3>{paymentShare.payerLabel}</h3>
              <p className="helper-text">Share amount for this settlement request.</p>
            </div>
            <span className={`badge ${statusBadgeClass(paymentShare.status)}`}>{formatStatusLabel(paymentShare.status)}</span>
          </div>

          <div className="detail-grid">
            <div className="detail-card">
              <span className="detail-label">Share amount</span>
              <span className="detail-value">{formatCurrency(paymentShare.amount)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Paid so far</span>
              <span className="detail-value">{formatCurrency(paymentSession.paidAmount)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Remaining</span>
              <span className="detail-value">{formatCurrency(paymentSession.remainingAmount)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Settlement status</span>
              <span className="detail-value">{formatStatusLabel(paymentSession.status)}</span>
            </div>
          </div>

          {paymentShare.paidAt ? <p className="meta">Completed at {formatDateTime(paymentShare.paidAt)}</p> : null}

          {paymentShare.status === "PENDING" ? (
            <div className="ticket-actions">
              <button type="button" className="ticket-action-btn" onClick={() => void handleAction("COMPLETE")} disabled={Boolean(runningAction)}>
                {runningAction === "COMPLETE" ? "Completing..." : "Complete payment"}
              </button>
              <button type="button" className="ticket-action-btn warn" onClick={() => void handleAction("FAIL")} disabled={Boolean(runningAction)}>
                {runningAction === "FAIL" ? "Failing..." : "Fail payment"}
              </button>
            </div>
          ) : null}

          {paymentShare.status === "PAID" ? (
            <div className="selection-summary stack-md">
              <p>
                <strong>Payment received.</strong>
              </p>
              <p className="helper-text">
                The cashier settlement screen is updated, and the table session is marked ready to close once every share is paid.
              </p>
            </div>
          ) : null}

          {paymentShare.status === "FAILED" ? (
            <div className="selection-summary stack-md">
              <p>
                <strong>Payment failed.</strong>
              </p>
              <p className="helper-text">Ask the cashier to retry cash, card, or a fresh online link from the settlement desk.</p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
