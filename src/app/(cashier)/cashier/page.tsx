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

type InvoiceResponse = {
  data: {
    id: string;
    splitMode: "FULL_BY_ONE" | "EQUAL" | "BY_GUEST_ITEMS";
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
    splitMode: "EQUAL" as "FULL_BY_ONE" | "EQUAL" | "BY_GUEST_ITEMS",
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

  return (
    <div className="stack-md">
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Cashier dashboard</h2>
            <p className="meta">Generate invoices with MVP split options only.</p>
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
        {loading ? <p className="meta">Loading...</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </section>

      <form className="form-card stack-md" onSubmit={handleCalculate}>
        <h3>Calculate split bill</h3>

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
                {session.branch.name} - {session.table.name} ({session.id.slice(0, 8)})
              </option>
            ))}
          </select>
        </label>

        <label>
          Split mode
          <select
            value={form.splitMode}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                splitMode: event.target.value as "FULL_BY_ONE" | "EQUAL" | "BY_GUEST_ITEMS",
                payerGuestId: ""
              }))
            }
          >
            <option value="FULL_BY_ONE">Full by one person</option>
            <option value="EQUAL">Equal split</option>
            <option value="BY_GUEST_ITEMS">By guest items</option>
          </select>
        </label>

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

        {form.splitMode === "BY_GUEST_ITEMS" ? (
          <p className="meta">
            This mode charges each guest only for their own assigned items.
          </p>
        ) : null}

        <button type="submit">Calculate invoice</button>
        {invoiceError ? <p className="error">{invoiceError}</p> : null}
      </form>

      {invoice ? (
        <section className="panel stack-md">
          <div className="section-head">
            <h3>Invoice #{invoice.id.slice(0, 8)}</h3>
            <span className="badge">{invoice.splitMode}</span>
          </div>

          <p>
            <strong>Total:</strong> ${Number(invoice.total).toFixed(2)}
          </p>

          <div className="grid-2">
            <div>
              <h4>Split result</h4>
              <div className="list">
                {invoice.splits.map((split) => (
                  <div key={split.id} className="list-item">
                    <p>
                      <strong>{split.payerLabel}</strong>
                    </p>
                    <p className="meta">${Number(split.amount).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4>Invoice lines</h4>
              <div className="list">
                {invoice.lines.map((line) => (
                  <div key={line.id} className="list-item">
                    <p>
                      <strong>{line.label}</strong>
                    </p>
                    <p className="meta">
                      ${Number(line.amount).toFixed(2)}{line.guest ? ` | ${line.guest.displayName}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
