"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US");
}

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

function formatStatusLabel(value: string) {
  if (value === "OPEN") {
    return "Open";
  }

  if (value === "PARTIALLY_PAID") {
    return "Partially paid";
  }

  if (value === "PAID") {
    return "Paid";
  }

  if (value === "FAILED") {
    return "Failed";
  }

  if (value === "EXPIRED") {
    return "Expired";
  }

  if (value === "UNPAID") {
    return "Unpaid";
  }

  if (value === "PENDING") {
    return "Pending";
  }

  if (value === "CANCELLED") {
    return "Cancelled";
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

export function MockPaymentExperience({ paymentShareId, token, tipAmount = "" }: Props) {
  const [state, setState] = useState<PaymentLinkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningAction, setRunningAction] = useState<"COMPLETE" | "FAIL" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const normalizedTipAmount = useMemo(() => normalizeTipAmount(tipAmount), [tipAmount]);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!token) {
      setError("Missing payment link.");
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
        throw new Error(json.error || "Failed to load payment link.");
      }

      setState(json.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load payment link.");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [paymentShareId, token]);

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
        throw new Error(json.error || "Mock payment action failed.");
      }

      setState(json.data);
      setMessage(
        action === "COMPLETE"
          ? normalizedTipAmount && toCents(normalizedTipAmount) > 0
            ? "Payment completed with tip."
            : "Payment completed."
          : "Payment marked as failed."
      );
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Mock payment action failed.");
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
            <p className="section-kicker">Secure payment step</p>
            <h2>{paymentSession?.session?.table ? `Table ${paymentSession.session.table.name}` : "Payment request"}</h2>
            <p className="panel-subtitle">
              This demo simulates the final Turkey payment handoff before a real iyzico / PayTR / card provider is
              connected.
            </p>
            <div className="badge-row">
              <span className="badge badge-outline">iyzico</span>
              <span className="badge badge-outline">PayTR</span>
              <span className="badge badge-outline">Bank card</span>
              {normalizedTipAmount && toCents(normalizedTipAmount) > 0 ? (
                <span className="badge badge-neutral">Tip {formatTryCurrency(normalizedTipAmount)}</span>
              ) : null}
            </div>
          </div>
          <button type="button" onClick={() => void load()}>
            Refresh
          </button>
        </div>

        <div className="status-stack">
          {loading ? <p className="status-banner is-neutral">Loading payment details.</p> : null}
          {error ? <p className="status-banner is-error">{error}</p> : null}
          {message ? <p className="status-banner is-success">{message}</p> : null}
        </div>
      </section>

      {paymentShare && paymentSession ? (
        <section className="panel stack-md">
          <div className="section-head">
            <div className="section-copy">
              <h3>{paymentShare.payerLabel}</h3>
              <p className="helper-text">Amount to be collected for this payment request.</p>
            </div>
            <span className={`badge ${statusBadgeClass(paymentShare.status)}`}>{formatStatusLabel(paymentShare.status)}</span>
          </div>

          <div className="detail-grid">
            <div className="detail-card">
              <span className="detail-label">Base share</span>
              <span className="detail-value">{formatTryCurrency(paymentShare.amount)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Selected tip</span>
              <span className="detail-value">
                {toCents(activeTipAmount) > 0 ? formatTryCurrency(activeTipAmount) : "No tip"}
              </span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Total charge</span>
              <span className="detail-value">{formatTryCurrency(totalChargeAmount ?? paymentShare.amount)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Bill remaining</span>
              <span className="detail-value">{formatTryCurrency(paymentSession.remainingAmount)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Payment status</span>
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
                {runningAction === "FAIL" ? "Updating..." : "Mark as failed"}
              </button>
            </div>
          ) : null}

          {paymentShare.status === "PAID" ? (
            <div className="selection-summary stack-md">
              <p>
                <strong>Payment received.</strong>
              </p>
              <p className="helper-text">
                Payment tracking has been updated. Once all bill shares are paid, the POS-side flow can close the table
                automatically.
              </p>
            </div>
          ) : null}

          {paymentShare.status === "FAILED" ? (
            <div className="selection-summary stack-md">
              <p>
                <strong>Payment failed.</strong>
              </p>
              <p className="helper-text">Retry via cashier with cash, card, or a new payment link.</p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
