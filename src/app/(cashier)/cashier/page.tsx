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

function formatCurrency(value: string | number): string {
  return `$${Number(value).toFixed(2)}`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

function formatShortTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatSessionLabel(session: OpenSession): string {
  return `${session.branch.name} • ${session.table.name} • Active Session`;
}

function formatSessionSummary(session: OpenSession): string {
  return `Table ${session.table.name} • Opened ${formatShortTime(session.openedAt)}`;
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
    return "Full by one guest";
  }

  if (mode === "BY_GUEST_ITEMS") {
    return "By guest items";
  }

  return "Equal split";
}

function splitModeDescription(mode: InvoiceSplitMode): string {
  if (mode === "FULL_BY_ONE") {
    return "Charge the full check to one selected guest.";
  }

  if (mode === "BY_GUEST_ITEMS") {
    return "Charge each guest only for items assigned to their name.";
  }

  return "Divide the check equally across all joined guests.";
}

function splitModeHelper(mode: InvoiceSplitMode): string {
  if (mode === "FULL_BY_ONE") {
    return "Use this when one guest pays now and settles internally later.";
  }

  if (mode === "BY_GUEST_ITEMS") {
    return "Use this for the most accurate guest-by-guest item breakdown.";
  }

  return "Use this for fast checkout when the group agrees to split evenly.";
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
    setInvoice(null);

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
    }
  }

  const totalGuests = sessions.reduce((sum, session) => sum + session.guests.length, 0);
  const invoiceSplitTotal = invoice
    ? invoice.splits.reduce((sum, split) => sum + Number(split.amount), 0)
    : 0;
  const invoiceUnassignedAmount = invoice ? Math.max(Number(invoice.total) - invoiceSplitTotal, 0) : 0;

  return (
    <div className="stack-md">
      <section className="panel dashboard-hero stack-md">
        <div className="section-head">
          <div className="dashboard-hero-copy">
            <p className="section-kicker">Billing desk</p>
            <h2>Cashier dashboard</h2>
            <p className="panel-subtitle">
              Review active tables, choose a split method, and present a clear bill summary for checkout.
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
            <p className="dashboard-stat-note">Tables ready for billing review.</p>
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
          <p className="helper-text">This preview reflects current session data and the selected split rule.</p>
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
              <span className="badge badge-neutral">Table {selectedSession.table.name}</span>
              <span className="badge badge-status-open">{selectedSession.guests.length} guests joined</span>
            </div>
            <p className="helper-text">{formatSessionSummary(selectedSession)}</p>
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

        <button type="submit">Calculate invoice</button>
        {invoiceError ? <p className="status-banner is-error">{invoiceError}</p> : null}
      </form>

      {invoice ? (
        <section className="panel stack-md">
          <div className="section-head">
            <div className="section-copy">
              <p className="section-kicker">Invoice</p>
              <h3>{formatInvoiceNumber(invoice.id, invoice.createdAt)}</h3>
              <p className="panel-subtitle">Calculated from the latest session snapshot and current split mode.</p>
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
              <span className="detail-label">Assigned to payers</span>
              <span className="detail-value">{formatCurrency(invoiceSplitTotal)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Remaining to assign</span>
              <span className="detail-value">{formatCurrency(invoiceUnassignedAmount)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Calculated at</span>
              <span className="detail-value">{formatDateTime(invoice.createdAt)}</span>
            </div>
          </div>

          <p className="helper-text">
            Payment posting is separate from this calculation screen. Until payment is completed, the full total is
            still outstanding.
          </p>

          <div className="grid-2">
            <div>
              <div className="section-copy">
                <h4>Split result</h4>
                <p className="helper-text">What each payer should be charged.</p>
              </div>
              <div className="split-grid">
                {invoice.splits.map((split) => {
                  const sharePercent = Number(invoice.total) > 0
                    ? (Number(split.amount) / Number(invoice.total)) * 100
                    : 0;

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
                <p className="helper-text">Line items included in the total.</p>
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
          <p className="empty empty-state">No invoice calculated yet. Choose an active session and split mode to preview the bill.</p>
        </section>
      )}
    </div>
  );
}

