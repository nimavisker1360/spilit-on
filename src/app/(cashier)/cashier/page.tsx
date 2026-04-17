"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { useRealtimeEvents } from "@/hooks/use-realtime-events";

type Guest = {
  id: string;
  displayName: string;
};

type OpenSession = {
  id: string;
  openedAt: string;
  readyToCloseAt: string | null;
  table: {
    name: string;
    code: string;
  };
  branch: {
    id: string;
    name: string;
  };
  guests: Guest[];
};

type InvoiceSplitMode = "FULL_BY_ONE" | "EQUAL" | "BY_GUEST_ITEMS";
type PaymentSessionStatus = "OPEN" | "PARTIALLY_PAID" | "PAID" | "FAILED" | "EXPIRED";
type PaymentShareStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED" | "CANCELLED";
type CashierPaymentShareAction =
  | "PAY_BY_CASH"
  | "PAY_BY_CARD"
  | "SEND_ONLINE_LINK"
  | "COMPLETE_PENDING_PAYMENT"
  | "MARK_PAYMENT_FAILED";

type InvoiceResponse = {
  data: {
    id: string;
    createdAt: string;
    splitMode: InvoiceSplitMode;
    total: string;
    lines: Array<{
      id: string;
      label: string;
      amount: string;
      guest: Guest | null;
    }>;
    splits: Array<{
      id: string;
      payerLabel: string;
      amount: string;
      guest: Guest | null;
    }>;
  };
  error?: string;
};

type PaymentShare = {
  id: string;
  payerLabel: string;
  amount: string;
  status: PaymentShareStatus;
  provider: string | null;
  paymentUrl: string | null;
  paidAt: string | null;
  guest: Guest | null;
};

type PaymentSession = {
  id: string;
  invoiceId: string;
  status: PaymentSessionStatus;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  currency: string;
  shares: PaymentShare[];
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

type PaymentSessionResponse = {
  data: {
    created: boolean;
    paymentSession: PaymentSession;
  };
  error?: string;
};

type PaymentShareActionResponse = {
  data: {
    action: CashierPaymentShareAction;
    message: string;
    paymentSession: PaymentSession;
    paymentShare: PaymentShare;
  };
  error?: string;
};

const currencyFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatCurrency(value: string | number): string {
  return currencyFormatter.format(Number(value));
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("tr-TR");
}

function formatShortTime(value: string): string {
  return new Date(value).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function formatSessionLabel(session: OpenSession): string {
  return `${session.branch.name} | Masa ${session.table.name} | Acik hesap`;
}

function formatSessionSummary(session: OpenSession): string {
  return `Masa ${session.table.name} | Acilis ${formatShortTime(session.openedAt)}`;
}

function formatInvoiceNumber(invoiceId: string, createdAt?: string): string {
  const stamp = createdAt ? new Date(createdAt) : new Date();
  const year = String(stamp.getFullYear());
  const month = String(stamp.getMonth() + 1).padStart(2, "0");
  const day = String(stamp.getDate()).padStart(2, "0");
  const suffix = invoiceId.replace(/[^a-z0-9]/gi, "").slice(-3).toUpperCase().padStart(3, "0");

  return `INV-${year}${month}${day}-${suffix}`;
}

function splitModeLabel(mode: InvoiceSplitMode): string {
  if (mode === "FULL_BY_ONE") {
    return "Tek kisi odeme";
  }

  if (mode === "BY_GUEST_ITEMS") {
    return "Kisiye gore urun";
  }

  return "Esit bolusum";
}

function splitModeDescription(mode: InvoiceSplitMode): string {
  if (mode === "FULL_BY_ONE") {
    return "Tum adisyon tek bir kisiye yazilir.";
  }

  if (mode === "BY_GUEST_ITEMS") {
    return "Her kisi sadece kendi urunlerini oder.";
  }

  return "Toplam tutar masadaki kisilere esit bolunur.";
}

function splitModeHelper(mode: InvoiceSplitMode): string {
  if (mode === "FULL_BY_ONE") {
    return "Kurumsal masa veya tek kart odemesi icin uygundur.";
  }

  if (mode === "BY_GUEST_ITEMS") {
    return "Turk restoranlarinda kisilerin kendi siparisini odedigi senaryo icin uygundur.";
  }

  return "Arkadas gruplarinda hizli cikis icin en pratik secenektir.";
}

function formatStatusLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function paymentShareStatusBadgeClass(status: PaymentShareStatus): string {
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

function paymentSessionStatusBadgeClass(status: PaymentSessionStatus): string {
  if (status === "PAID") {
    return "badge-status-paid-payment";
  }

  if (status === "PARTIALLY_PAID") {
    return "badge-status-progress";
  }

  return "badge-status-open";
}

function paymentProviderLabel(provider: string): string {
  if (provider === "CASH_DESK") {
    return "Cash desk";
  }

  if (provider === "CARD_POS") {
    return "Card POS";
  }

  if (provider === "MOCK_ONLINE_LINK") {
    return "Online link (mock)";
  }

  return formatStatusLabel(provider);
}

async function fetchSessions(): Promise<OpenSession[]> {
  const response = await fetch("/api/sessions", { cache: "no-store" });
  const json = (await response.json()) as { data?: OpenSession[]; error?: string };

  if (!response.ok) {
    throw new Error(json.error || "Could not load sessions");
  }

  return json.data ?? [];
}

export default function CashierDashboardPage() {
  const [sessions, setSessions] = useState<OpenSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [invoiceError, setInvoiceError] = useState("");
  const [invoice, setInvoice] = useState<InvoiceResponse["data"] | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [paymentSession, setPaymentSession] = useState<PaymentSession | null>(null);
  const [paymentSessionNotice, setPaymentSessionNotice] = useState("");
  const [paymentSessionError, setPaymentSessionError] = useState("");
  const [isPreparingPayment, setIsPreparingPayment] = useState(false);
  const [runningShareAction, setRunningShareAction] = useState<{
    shareId: string;
    action: CashierPaymentShareAction;
  } | null>(null);

  const [form, setForm] = useState({
    sessionId: "",
    splitMode: "EQUAL" as InvoiceSplitMode,
    payerGuestId: ""
  });

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === form.sessionId),
    [sessions, form.sessionId]
  );

  async function loadData(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setLoading(true);
    }

    setError("");

    try {
      const data = await fetchSessions();
      setSessions(data);

      if (!form.sessionId && data[0]) {
        setForm((prev) => ({ ...prev, sessionId: data[0].id }));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load cashier data");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtimeEvents({
    role: "cashier",
    onEvent: (event) => {
      if (event.type === "kitchen.item-status.updated") {
        void loadData({ silent: true });
      }
    }
  });

  async function handleCalculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInvoiceError("");
    setPaymentSession(null);
    setPaymentSessionNotice("");
    setPaymentSessionError("");
    setRunningShareAction(null);
    setIsCalculating(true);

    try {
      const response = await fetch("/api/cashier/invoices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: form.sessionId,
          splitMode: form.splitMode,
          payerGuestId: form.splitMode === "FULL_BY_ONE" ? form.payerGuestId : undefined
        })
      });

      const json = (await response.json()) as InvoiceResponse;

      if (!response.ok) {
        throw new Error(json.error || "Invoice calculation failed");
      }

      setInvoice(json.data);
    } catch (calcError) {
      setInvoiceError(calcError instanceof Error ? calcError.message : "Invoice calculation failed");
    } finally {
      setIsCalculating(false);
    }
  }

  async function handlePreparePayment() {
    if (!invoice) {
      return;
    }

    setPaymentSessionError("");
    setPaymentSessionNotice("");
    setRunningShareAction(null);
    setIsPreparingPayment(true);

    try {
      const response = await fetch(`/api/cashier/invoices/${encodeURIComponent(invoice.id)}/payment-session`, {
        method: "POST"
      });

      const json = (await response.json()) as PaymentSessionResponse;

      if (!response.ok) {
        throw new Error(json.error || "Payment preparation failed");
      }

      setPaymentSession(json.data.paymentSession);
      setPaymentSessionNotice(
        json.data.created
          ? "Payment shares are ready. Start each mock payment from the cashier desk and complete pending ones as they settle."
          : "Existing payment session loaded for this invoice."
      );
    } catch (prepareError) {
      setPaymentSessionError(prepareError instanceof Error ? prepareError.message : "Payment preparation failed");
    } finally {
      setIsPreparingPayment(false);
    }
  }

  async function handleShareAction(shareId: string, action: CashierPaymentShareAction) {
    setPaymentSessionError("");
    setPaymentSessionNotice("");
    setRunningShareAction({ shareId, action });

    try {
      const response = await fetch(`/api/cashier/payment-shares/${encodeURIComponent(shareId)}/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action })
      });

      const json = (await response.json()) as PaymentShareActionResponse;

      if (!response.ok) {
        throw new Error(json.error || "Payment share update failed");
      }

      setPaymentSession(json.data.paymentSession);
      setPaymentSessionNotice(json.data.message);
      void loadData({ silent: true });
    } catch (actionError) {
      setPaymentSessionError(actionError instanceof Error ? actionError.message : "Payment share update failed");
    } finally {
      setRunningShareAction(null);
    }
  }

  function isShareActionRunning(shareId: string, action: CashierPaymentShareAction): boolean {
    return runningShareAction?.shareId === shareId && runningShareAction.action === action;
  }

  const totalGuests = sessions.reduce((sum, session) => sum + session.guests.length, 0);
  const invoiceSplitTotal = invoice ? invoice.splits.reduce((sum, split) => sum + Number(split.amount), 0) : 0;
  const invoiceUnassignedAmount = invoice ? Math.max(Number(invoice.total) - invoiceSplitTotal, 0) : 0;
  const invoiceAverageShare = invoice && invoice.splits.length > 0 ? Number(invoice.total) / invoice.splits.length : 0;
  const paymentSummary = useMemo(() => {
    if (!paymentSession) {
      return null;
    }

    return {
      totalAmount: Number(paymentSession.totalAmount),
      paidAmount: Number(paymentSession.paidAmount),
      remainingAmount: Number(paymentSession.remainingAmount),
      unpaidShareCount: paymentSession.shares.filter((share) => share.status !== "PAID").length,
      pendingShareCount: paymentSession.shares.filter((share) => share.status === "PENDING").length,
      failedShareCount: paymentSession.shares.filter((share) => share.status === "FAILED").length
    };
  }, [paymentSession]);

  return (
    <div className="stack-md">
      <section className="panel dashboard-hero stack-md">
        <div className="section-head">
          <div className="dashboard-hero-copy">
            <p className="section-kicker">Billing desk</p>
            <h2>Cashier settlement desk</h2>
            <p className="panel-subtitle">
              Calculate split invoices, prepare payment shares, and complete settlement per payer from one clear screen.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              loadData();
            }}
          >
            Refresh
          </button>
        </div>

        <div className="dashboard-stat-grid">
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">Open sessions</p>
            <p className="dashboard-stat-value">{sessions.length}</p>
            <p className="dashboard-stat-note">Tables waiting for checkout.</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">Guests in house</p>
            <p className="dashboard-stat-value">{totalGuests}</p>
            <p className="dashboard-stat-note">Joined diners across active tables.</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">Selected table</p>
            <p className="dashboard-stat-value">{selectedSession ? selectedSession.table.name : "-"}</p>
            <p className="dashboard-stat-note">
              {selectedSession ? formatSessionSummary(selectedSession) : "Choose an active session to begin."}
            </p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">Split mode</p>
            <p className="dashboard-stat-value">{splitModeLabel(form.splitMode)}</p>
            <p className="dashboard-stat-note">{splitModeDescription(form.splitMode)}</p>
          </article>
        </div>

        <div className="status-stack">
          {loading ? <p className="status-banner is-neutral">Loading open sessions for billing.</p> : null}
          {error ? <p className="status-banner is-error">{error}</p> : null}
        </div>
      </section>

      <form className="form-card stack-md" onSubmit={handleCalculate}>
        <div className="section-copy">
          <h3>Calculate split bill</h3>
          <p className="helper-text">Generate the invoice summary before preparing settlement actions.</p>
        </div>

        <label>
          Open session
          <select
            value={form.sessionId}
            onChange={(event) => setForm((prev) => ({ ...prev, sessionId: event.target.value }))}
            required
          >
            <option value="">Select session</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {formatSessionLabel(session)}
              </option>
            ))}
          </select>
        </label>

        {selectedSession ? (
          <div className="selection-summary stack-md">
            <div className="badge-row">
              <span className="badge badge-outline">{selectedSession.branch.name}</span>
              <span className="badge badge-neutral">Masa {selectedSession.table.name}</span>
              <span className="badge badge-status-open">{selectedSession.guests.length} guests joined</span>
              {selectedSession.readyToCloseAt ? (
                <span className="badge badge-status-paid-payment">Ready to close</span>
              ) : null}
            </div>
            <p className="helper-text">
              {formatSessionSummary(selectedSession)}
              {selectedSession.readyToCloseAt ? ` | Ready since ${formatDateTime(selectedSession.readyToCloseAt)}` : ""}
            </p>
          </div>
        ) : null}

        <label>
          Split mode
          <select
            value={form.splitMode}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                splitMode: event.target.value as InvoiceSplitMode,
                payerGuestId: ""
              }))
            }
          >
            <option value="FULL_BY_ONE">Full bill to one guest</option>
            <option value="EQUAL">Equal split</option>
            <option value="BY_GUEST_ITEMS">By guest items</option>
          </select>
        </label>

        <div className="helper-panel stack-md">
          <p className="helper-text">{splitModeDescription(form.splitMode)}</p>
          <p className="meta">{splitModeHelper(form.splitMode)}</p>
        </div>

        {form.splitMode === "FULL_BY_ONE" ? (
          <label>
            Paying guest
            <select
              value={form.payerGuestId}
              onChange={(event) => setForm((prev) => ({ ...prev, payerGuestId: event.target.value }))}
              required
            >
              <option value="">Select payer</option>
              {selectedSession?.guests.map((guest) => (
                <option key={guest.id} value={guest.id}>
                  {guest.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <button type="submit" disabled={isCalculating || !form.sessionId}>
          {isCalculating ? "Calculating..." : "Calculate invoice"}
        </button>
        {invoiceError ? <p className="status-banner is-error">{invoiceError}</p> : null}
      </form>

      {invoice ? (
        <section className="panel stack-md invoice-result-panel">
          {isCalculating ? <p className="status-banner is-neutral">Refreshing invoice summary with latest session data.</p> : null}

          <div className="section-head">
            <div className="section-copy">
              <p className="section-kicker">Invoice</p>
              <h3>{formatInvoiceNumber(invoice.id, invoice.createdAt)}</h3>
              <p className="panel-subtitle">Invoice summary remains visible while you prepare and settle payments.</p>
            </div>
            <span className="badge badge-outline">{splitModeLabel(invoice.splitMode)}</span>
          </div>

          <div className="invoice-total-card">
            <p className="dashboard-stat-label">Grand total</p>
            <p className="invoice-total-value">{formatCurrency(invoice.total)}</p>
            <p className="dashboard-stat-note">
              {invoice.splits.length} payment share(s) across {invoice.lines.length} invoice line(s).
            </p>
          </div>

          <div className="detail-grid">
            <div className="detail-card">
              <span className="detail-label">Split mode</span>
              <span className="detail-value">{splitModeLabel(invoice.splitMode)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Per-guest share (avg)</span>
              <span className="detail-value">{formatCurrency(invoiceAverageShare)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Assigned to payers</span>
              <span className="detail-value">{formatCurrency(invoiceSplitTotal)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Remaining / unpaid</span>
              <span className="detail-value">{formatCurrency(invoiceUnassignedAmount)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Calculated at</span>
              <span className="detail-value">{formatDateTime(invoice.createdAt)}</span>
            </div>
          </div>

          <div className="prepare-payment-panel stack-md">
            <div className="section-copy">
              <h4>Prepare payment</h4>
              <p className="helper-text">
                Create local payment shares after invoice calculation. Cash, card, and online-link actions use mock
                status transitions only.
              </p>
            </div>

            <div className="ticket-actions">
              <button
                type="button"
                className="ticket-action-btn"
                onClick={handlePreparePayment}
                disabled={isPreparingPayment}
              >
                {isPreparingPayment ? "Preparing payment..." : "Prepare payment"}
              </button>
            </div>
          </div>

          {paymentSessionNotice ? <p className="status-banner is-success">{paymentSessionNotice}</p> : null}
          {paymentSessionError ? <p className="status-banner is-error">{paymentSessionError}</p> : null}

          {paymentSession ? (
            <div className="settlement-desk stack-md">
              <div className="section-head">
                <div className="section-copy">
                  <p className="section-kicker">Settlement</p>
                  <h4>Payment share control</h4>
                  <p className="helper-text">Start mock payments, resolve pending ones, and track settlement totals from one place.</p>
                </div>
                <span className={`badge ${paymentSessionStatusBadgeClass(paymentSession.status)}`}>
                  {formatStatusLabel(paymentSession.status)}
                </span>
              </div>

              {paymentSession.session?.readyToCloseAt ? (
                <p className="status-banner is-success">
                  Table {paymentSession.session.table?.name ?? selectedSession?.table.name ?? ""} is ready to close since{" "}
                  {formatDateTime(paymentSession.session.readyToCloseAt)}.
                </p>
              ) : null}

              {paymentSummary ? (
                <div className="grid-4 checkout-summary-grid">
                  <article className="dashboard-stat-card checkout-summary-card">
                    <p className="dashboard-stat-label">Total amount</p>
                    <p className="dashboard-stat-value">{formatCurrency(paymentSummary.totalAmount)}</p>
                    <p className="dashboard-stat-note">Invoice settlement target.</p>
                  </article>
                  <article className="dashboard-stat-card checkout-summary-card">
                    <p className="dashboard-stat-label">Paid amount</p>
                    <p className="dashboard-stat-value">{formatCurrency(paymentSummary.paidAmount)}</p>
                    <p className="dashboard-stat-note">Collected shares marked paid.</p>
                  </article>
                  <article className="dashboard-stat-card checkout-summary-card">
                    <p className="dashboard-stat-label">Remaining amount</p>
                    <p className="dashboard-stat-value">{formatCurrency(paymentSummary.remainingAmount)}</p>
                    <p className="dashboard-stat-note">Balance still to collect.</p>
                  </article>
                  <article className="dashboard-stat-card checkout-summary-card">
                    <p className="dashboard-stat-label">Unpaid shares</p>
                    <p className="dashboard-stat-value">{paymentSummary.unpaidShareCount}</p>
                    <p className="dashboard-stat-note">
                      Pending {paymentSummary.pendingShareCount} | Failed {paymentSummary.failedShareCount}
                    </p>
                  </article>
                </div>
              ) : null}

              <div className="section-copy">
                <h4>Generated payment shares</h4>
                <p className="helper-text">Each row includes payer label, amount, status, and direct cashier actions.</p>
              </div>

              <div className="checkout-share-grid">
                {paymentSession.shares.map((share) => {
                  const isPaid = share.status === "PAID";
                  const isPending = share.status === "PENDING";
                  const canStartPayment = share.status === "UNPAID" || share.status === "FAILED";
                  const canMarkFailedDirectly = share.status === "UNPAID";
                  const actionLocked = Boolean(runningShareAction) || isPreparingPayment;

                  return (
                    <article key={share.id} className="checkout-share-card stack-md">
                      <div className="checkout-share-head">
                        <div className="checkout-share-copy">
                          <p className="checkout-share-payer">{share.payerLabel}</p>
                          <p className="meta">{share.guest ? `Guest: ${share.guest.displayName}` : "Session-level payer"}</p>
                        </div>
                        <p className="checkout-share-amount">{formatCurrency(share.amount)}</p>
                      </div>

                      <div className="badge-row">
                        <span className={`badge ${paymentShareStatusBadgeClass(share.status)}`}>
                          {formatStatusLabel(share.status)}
                        </span>
                        {share.provider ? <span className="badge badge-outline">{paymentProviderLabel(share.provider)}</span> : null}
                        {share.paidAt ? <span className="badge badge-neutral">Paid {formatShortTime(share.paidAt)}</span> : null}
                      </div>

                      {share.paymentUrl ? (
                        <p className="helper-text">
                          Online link ready:{" "}
                          <a className="checkout-link" href={share.paymentUrl} target="_blank" rel="noreferrer">
                            Open mock payment link
                          </a>
                        </p>
                      ) : null}

                      {share.paidAt ? <p className="meta">Completed at {formatDateTime(share.paidAt)}</p> : null}

                      {canStartPayment ? (
                        <div className="ticket-actions">
                          <button
                            type="button"
                            className="ticket-action-btn"
                            onClick={() => handleShareAction(share.id, "PAY_BY_CASH")}
                            disabled={actionLocked || isPaid}
                          >
                            {isShareActionRunning(share.id, "PAY_BY_CASH") ? "Starting cash..." : "Pay by cash"}
                          </button>
                          <button
                            type="button"
                            className="ticket-action-btn"
                            onClick={() => handleShareAction(share.id, "PAY_BY_CARD")}
                            disabled={actionLocked || isPaid}
                          >
                            {isShareActionRunning(share.id, "PAY_BY_CARD") ? "Starting card..." : "Pay by card"}
                          </button>
                          <button
                            type="button"
                            className="ticket-action-btn"
                            onClick={() => handleShareAction(share.id, "SEND_ONLINE_LINK")}
                            disabled={actionLocked || isPaid}
                          >
                            {isShareActionRunning(share.id, "SEND_ONLINE_LINK")
                              ? "Sending link..."
                              : "Send online link"}
                          </button>
                        </div>
                      ) : null}

                      {isPending ? (
                        <div className="ticket-actions">
                          <button
                            type="button"
                            className="ticket-action-btn"
                            onClick={() => handleShareAction(share.id, "COMPLETE_PENDING_PAYMENT")}
                            disabled={actionLocked}
                          >
                            {isShareActionRunning(share.id, "COMPLETE_PENDING_PAYMENT")
                              ? "Completing..."
                              : "Complete payment"}
                          </button>
                          <button
                            type="button"
                            className="ticket-action-btn warn"
                            onClick={() => handleShareAction(share.id, "MARK_PAYMENT_FAILED")}
                            disabled={actionLocked}
                          >
                            {isShareActionRunning(share.id, "MARK_PAYMENT_FAILED") ? "Failing..." : "Mark failed"}
                          </button>
                        </div>
                      ) : null}

                      {canMarkFailedDirectly ? (
                        <div className="ticket-actions">
                          <button
                            type="button"
                            className="ticket-action-btn warn"
                            onClick={() => handleShareAction(share.id, "MARK_PAYMENT_FAILED")}
                            disabled={actionLocked}
                          >
                            {isShareActionRunning(share.id, "MARK_PAYMENT_FAILED")
                              ? "Failing..."
                              : "Mark failed (mock)"}
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="grid-2">
            <div>
              <div className="section-copy">
                <h4>Per-guest invoice shares</h4>
                <p className="helper-text">Reference split values before collecting payment.</p>
              </div>
              <div className="split-grid">
                {invoice.splits.map((split) => {
                  const sharePercent = Number(invoice.total) > 0 ? (Number(split.amount) / Number(invoice.total)) * 100 : 0;

                  return (
                    <article key={split.id} className="split-card stack-md">
                      <div className="badge-row">
                        <span className="badge badge-outline">{split.payerLabel}</span>
                        {split.guest ? <span className="badge badge-neutral">{split.guest.displayName}</span> : null}
                      </div>
                      <p>
                        <strong>{formatCurrency(split.amount)}</strong>
                      </p>
                      <p className="meta">{sharePercent.toFixed(1)}% of total</p>
                    </article>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="section-copy">
                <h4>Invoice lines</h4>
                <p className="helper-text">Line items included in the current total.</p>
              </div>
              <div className="list">
                {invoice.lines.map((line) => (
                  <div key={line.id} className="list-item entity-card stack-md">
                    <div className="entity-top">
                      <p>
                        <strong>{line.label}</strong>
                      </p>
                      <span className="badge badge-outline">{formatCurrency(line.amount)}</span>
                    </div>
                    <p className="meta">{line.guest ? `Assigned to ${line.guest.displayName}` : "Shared line item"}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="panel">
          <p className="empty empty-state">No invoice calculated yet. Choose an active session and split mode to start checkout.</p>
        </section>
      )}
    </div>
  );
}

