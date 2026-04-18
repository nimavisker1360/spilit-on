"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { formatTryCurrency } from "@/lib/currency";
import {
  clearGuestIdentity,
  readGuestIdentity,
  writeGuestIdentity,
  type GuestIdentityInput,
  type GuestIdentityRecord
} from "@/lib/guest-identity";

type SplitMode = "FULL_BY_ONE" | "EQUAL" | "BY_GUEST_ITEMS";
type PaymentSessionStatus = "OPEN" | "PARTIALLY_PAID" | "PAID" | "FAILED" | "EXPIRED";
type PaymentShareStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED" | "CANCELLED";
type GuestPaymentEntryMatchSource = "EXACT_GUEST_ID" | "NORMALIZED_NAME" | "CASE_INSENSITIVE_NORMALIZED_NAME" | "ALIAS" | null;

type GuestPaymentEntryShare = {
  id: string;
  guestId: string | null;
  payerLabel: string;
  amount: string;
  status: PaymentShareStatus;
  paymentUrl: string | null;
  provider: string | null;
};

type GuestPaymentEntryLine = {
  id: string;
  label: string;
  amount: string;
  itemName: string | null;
  quantity: number | null;
  unitPrice: string | null;
  guestId: string | null;
  guestName: string | null;
};

type GuestPaymentEntryGuestCandidate = {
  id: string;
  displayName: string;
  hasPaymentShare: boolean;
  shareAmount: string | null;
  shareStatus: PaymentShareStatus | null;
};

type GuestPaymentEntryMapping = {
  matchSource: GuestPaymentEntryMatchSource;
  requiresSelection: boolean;
  message: string | null;
  payMyShareDisabledReason: string | null;
  candidates: GuestPaymentEntryGuestCandidate[];
};

type GuestPaymentEntryDebug = {
  joinedCustomer: {
    guestId: string | null;
    guestName: string | null;
    sessionId: string | null;
    sessionScoped: boolean;
  };
  sessionGuests: Array<{
    guestId: string;
    displayName: string;
  }>;
  addAnotherGuestAvailable: boolean;
  detectedGuestCandidates: Array<{
    guestId: string;
    displayName: string;
    strategy: Exclude<GuestPaymentEntryMatchSource, null>;
  }>;
  finalMatchedGuestId: string | null;
  matchedPaymentShareId: string | null;
};

type GuestPaymentEntryState = {
  table: {
    id: string;
    name: string;
    code: string;
  };
  session: {
    id: string;
    openedAt: string;
    guests: Array<{
      id: string;
      displayName: string;
    }>;
  } | null;
  identifiedGuest: {
    id: string;
    displayName: string;
  } | null;
  mapping: GuestPaymentEntryMapping;
  paymentSession: {
    id: string;
    splitMode: SplitMode;
    status: PaymentSessionStatus;
    totalAmount: string;
    paidAmount: string;
    remainingAmount: string;
    currency: string;
    fullBillOptionEnabled: boolean;
    myShare: GuestPaymentEntryShare | null;
    fullBillShare: GuestPaymentEntryShare | null;
    shares: GuestPaymentEntryShare[];
    invoiceLines: GuestPaymentEntryLine[];
  } | null;
  debug?: GuestPaymentEntryDebug;
};

type GuestPaymentEntryResponse = {
  data?: GuestPaymentEntryState;
  error?: string;
};

type Props = {
  tableCode: string;
  initialGuestId?: string;
  backHref: string;
};

type GuestIdentityState = Pick<GuestIdentityRecord, "guestId" | "guestName" | "sessionId">;

const isDevelopment = process.env.NODE_ENV !== "production";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US");
}

function formatSplitModeLabel(mode: SplitMode): string {
  if (mode === "FULL_BY_ONE") {
    return "Full bill";
  }

  if (mode === "BY_GUEST_ITEMS") {
    return "By guest items";
  }

  return "Equal split";
}

function formatPaymentStatus(value: string): string {
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

function formatMatchSource(value: GuestPaymentEntryMatchSource): string {
  if (value === "EXACT_GUEST_ID") {
    return "id";
  }

  if (value === "NORMALIZED_NAME") {
    return "name";
  }

  if (value === "CASE_INSENSITIVE_NORMALIZED_NAME") {
    return "name (case-insensitive)";
  }

  if (value === "ALIAS") {
    return "alias";
  }

  return "unresolved";
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

  if (status === "FAILED" || status === "EXPIRED") {
    return "badge-danger";
  }

  return "badge-status-open";
}

function resolveLineQuantity(line: GuestPaymentEntryLine): number {
  if (typeof line.quantity === "number" && Number.isInteger(line.quantity) && line.quantity > 0) {
    return line.quantity;
  }

  const labelMatch = line.label.match(/\sx(\d+)$/i);

  if (!labelMatch) {
    return 1;
  }

  const parsed = Number.parseInt(labelMatch[1], 10);

  return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
}

function normalizeGuestIdentity(identity: GuestIdentityRecord | GuestIdentityState | null): GuestIdentityState | null {
  const guestId = identity?.guestId?.trim() ?? "";

  if (!guestId) {
    return null;
  }

  return {
    guestId,
    guestName: identity?.guestName?.trim() ?? "",
    sessionId: identity?.sessionId?.trim() || null
  };
}

function sameGuestIdentity(left: GuestIdentityState | null, right: GuestIdentityState | null): boolean {
  return left?.guestId === right?.guestId && left?.guestName === right?.guestName && left?.sessionId === right?.sessionId;
}

async function fetchGuestPaymentEntry(tableCode: string, identity: GuestIdentityState | null): Promise<GuestPaymentEntryState> {
  const payload: GuestIdentityInput = {
    guestId: identity?.guestId ?? "",
    guestName: identity?.guestName ?? ""
  };

  if (identity?.sessionId) {
    payload.sessionId = identity.sessionId;
  }
  const response = await fetch(`/api/guest/${encodeURIComponent(tableCode)}/payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    cache: "no-store",
    body: JSON.stringify(payload)
  });
  const json = (await response.json()) as GuestPaymentEntryResponse;

  if (!response.ok || !json.data) {
    throw new Error(json.error || "Failed to load payment details.");
  }

  return json.data;
}

export function GuestPaymentEntry({ tableCode, initialGuestId = "", backHref }: Props) {
  const [state, setState] = useState<GuestPaymentEntryState | null>(null);
  const [identity, setIdentity] = useState<GuestIdentityState | null>(() =>
    initialGuestId.trim()
      ? {
          guestId: initialGuestId.trim(),
          guestName: "",
          sessionId: null
        }
      : null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(false);

  const persistIdentity = useCallback(
    (nextIdentity: GuestIdentityState | null) => {
      const normalizedIdentity = normalizeGuestIdentity(nextIdentity);

      setIdentity((current) => (sameGuestIdentity(current, normalizedIdentity) ? current : normalizedIdentity));

      if (normalizedIdentity) {
        writeGuestIdentity(tableCode, normalizedIdentity);
        return;
      }

      clearGuestIdentity(tableCode);
    },
    [tableCode]
  );

  useEffect(() => {
    if (identity?.guestId) {
      return;
    }

    const storedIdentity = normalizeGuestIdentity(readGuestIdentity(tableCode));

    if (storedIdentity) {
      setIdentity((current) => (sameGuestIdentity(current, storedIdentity) ? current : storedIdentity));
    }
  }, [identity?.guestId, tableCode]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const payload = await fetchGuestPaymentEntry(tableCode, identity);
      setState(payload);

      if (!payload.session) {
        if (identity) {
          persistIdentity(null);
        }
        return;
      }

      if (payload.identifiedGuest) {
        persistIdentity({
          guestId: payload.identifiedGuest.id,
          guestName: payload.identifiedGuest.displayName,
          sessionId: payload.session.id
        });
        return;
      }

      if (identity?.guestId || identity?.guestName) {
        persistIdentity(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load payment details.");
    } finally {
      setLoading(false);
    }
  }, [identity, persistIdentity, tableCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const paymentSession = state?.paymentSession ?? null;
  const myShare = paymentSession?.myShare ?? null;
  const fullBillShare = paymentSession?.fullBillShare ?? null;
  const identifiedGuestId = state?.identifiedGuest?.id ?? "";
  const myInvoiceLines = useMemo(() => {
    if (!paymentSession || !identifiedGuestId) {
      return [];
    }

    return paymentSession.invoiceLines.filter((line) => line.guestId === identifiedGuestId);
  }, [identifiedGuestId, paymentSession]);
  const visibleInvoiceLines = useMemo(() => {
    if (!paymentSession) {
      return [];
    }

    return identifiedGuestId ? myInvoiceLines : paymentSession.invoiceLines;
  }, [identifiedGuestId, myInvoiceLines, paymentSession]);
  const myInvoiceSubtotal = useMemo(
    () => myInvoiceLines.reduce((sum, line) => sum + Number(line.amount), 0),
    [myInvoiceLines]
  );
  const myInvoiceItemCount = useMemo(
    () => myInvoiceLines.reduce((sum, line) => sum + resolveLineQuantity(line), 0),
    [myInvoiceLines]
  );
  const myShareDiffersFromItems = Boolean(
    myShare && identifiedGuestId && Math.abs(Number(myShare.amount) - myInvoiceSubtotal) > 0.009
  );
  const joinedGuestNames = useMemo(
    () => state?.session?.guests.map((guest) => guest.displayName).filter(Boolean) ?? [],
    [state?.session?.guests]
  );
  const mapping = state?.mapping ?? {
    matchSource: null,
    requiresSelection: false,
    message: null,
    payMyShareDisabledReason: null,
    candidates: []
  };
  const canPayMyShare = Boolean(state?.identifiedGuest && myShare && myShare.status !== "PAID");
  const canPayAll = Boolean(fullBillShare && fullBillShare.status !== "PAID");

  function routeToHostedPayment(share: GuestPaymentEntryShare | null, fallback: string) {
    setMessage("");

    if (!share) {
      setMessage(fallback);
      return;
    }

    if (share.status === "PAID") {
      setMessage("This payment already appears to be completed.");
      return;
    }

    if (!share.paymentUrl) {
      setMessage("Online payment link is not ready yet. Ask cashier for a payment link.");
      return;
    }

    window.location.assign(share.paymentUrl);
  }

  function handlePayMyShare() {
    routeToHostedPayment(myShare, mapping.payMyShareDisabledReason ?? "Your payment share is not ready yet.");
  }

  function handlePayAll() {
    routeToHostedPayment(fullBillShare, "Pay full bill option is not available for this check.");
  }

  function handleViewBreakdown() {
    setMessage("");
    setShowBreakdown((current) => !current);
  }

  function handleSelectGuest(candidate: GuestPaymentEntryGuestCandidate) {
    if (!state?.session) {
      return;
    }

    setMessage(`${candidate.displayName} selected. Loading your share.`);
    setError("");
    persistIdentity({
      guestId: candidate.id,
      guestName: candidate.displayName,
      sessionId: state.session.id
    });
  }

  function renderGuestSelector() {
    if (!mapping.requiresSelection) {
      return null;
    }

    if (mapping.candidates.length === 0) {
      return <p className="helper-text">No joined guest found, so selection is unavailable.</p>;
    }

    return (
      <div className="stack-md">
        <div className="section-copy">
          <h4>Select your name</h4>
          <p className="helper-text">Select your name from the list to view and pay your own share.</p>
        </div>

        <div className="guest-selector-list">
          {mapping.candidates.map((candidate) => {
            const candidateShareMeta = candidate.hasPaymentShare
              ? `${candidate.shareAmount ? formatTryCurrency(candidate.shareAmount) : "-"} | ${candidate.shareStatus ? formatPaymentStatus(candidate.shareStatus) : "Ready"}`
              : paymentSession
                ? "No active share found for this guest"
                : "Share is being prepared";

            return (
              <button
                key={candidate.id}
                type="button"
                className="guest-selector-btn"
                onClick={() => handleSelectGuest(candidate)}
              >
                <span className="guest-selector-name">{candidate.displayName}</span>
                <span className="guest-selector-meta">{candidateShareMeta}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="stack-md">
      <section className="panel dashboard-hero stack-md">
        <div className="section-head">
          <div className="dashboard-hero-copy">
            <p className="section-kicker">QR payment entry</p>
            <h2>{state ? `Table ${state.table.name}` : "Table payment"}</h2>
            <p className="panel-subtitle">
              Card details are not collected on this step. You will continue to a secure payment page in the next step.
            </p>
          </div>
          <div className="inline">
            <Link href={backHref} className="guest-footer-link">
              Back to order screen
            </Link>
            <button type="button" onClick={() => void load()}>
              Refresh
            </button>
          </div>
        </div>

        <div className="status-stack">
          {loading ? <p className="status-banner is-neutral">Loading payment details.</p> : null}
          {error ? <p className="status-banner is-error">{error}</p> : null}
          {message ? <p className="status-banner is-neutral">{message}</p> : null}
        </div>
      </section>

      {state?.session ? (
        <section className="panel stack-md">
          <div className="section-head">
            <div className="section-copy">
              <h3>Table session</h3>
              <p className="helper-text">Table: {state.table.name}</p>
              <p className="helper-text">Opened at: {formatDateTime(state.session.openedAt)}</p>
            </div>
            {paymentSession ? (
              <span className={`badge ${paymentSessionStatusBadgeClass(paymentSession.status)}`}>
                {formatPaymentStatus(paymentSession.status)}
              </span>
            ) : (
              <span className="badge badge-status-open">Waiting for payment</span>
            )}
          </div>

          <div className="selection-summary stack-md">
            <p className="dashboard-stat-label">Joined guests</p>
            {joinedGuestNames.length > 0 ? (
              <div className="guest-strip">
                {joinedGuestNames.map((name) => (
                  <span key={name} className="guest-chip">
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="helper-text">No guest has joined yet.</p>
            )}
          </div>

          <div className="selection-summary stack-md">
            <div className="section-copy">
              <h3>Guest mapping</h3>
              <p className="helper-text">{mapping.message ?? "When your name is matched to this session, your own share appears here."}</p>
            </div>

            {state.identifiedGuest ? (
              <div className="stack-md">
                <p>
                  Matched guest: <strong>{state.identifiedGuest.displayName}</strong>
                </p>
                <div className="badge-row">
                  <span className="badge badge-neutral">Guest matched</span>
                  {mapping.matchSource ? (
                    <span className="badge badge-outline">Match source: {formatMatchSource(mapping.matchSource)}</span>
                  ) : null}
                  {myShare ? (
                    <span className={`badge ${paymentShareStatusBadgeClass(myShare.status)}`}>
                      Payment status: {formatPaymentStatus(myShare.status)}
                    </span>
                  ) : (
                    <span className="badge badge-danger">No payment share found</span>
                  )}
                </div>
              </div>
            ) : (
              renderGuestSelector()
            )}
          </div>

          {paymentSession ? (
            <>
              <div className="detail-grid">
                <div className="detail-card">
                  <span className="detail-label">Split mode</span>
                  <span className="detail-value">{formatSplitModeLabel(paymentSession.splitMode)}</span>
                </div>
                <div className="detail-card">
                  <span className="detail-label">Your share</span>
                  <span className="detail-value">{myShare ? formatTryCurrency(myShare.amount) : "Select your name"}</span>
                </div>
                <div className="detail-card">
                  <span className="detail-label">Total check</span>
                  <span className="detail-value">{formatTryCurrency(paymentSession.totalAmount)}</span>
                </div>
                <div className="detail-card">
                  <span className="detail-label">Remaining amount</span>
                  <span className="detail-value">{formatTryCurrency(paymentSession.remainingAmount)}</span>
                </div>
                {identifiedGuestId ? (
                  <div className="detail-card">
                    <span className="detail-label">Your items subtotal</span>
                    <span className="detail-value">{formatTryCurrency(myInvoiceSubtotal)}</span>
                  </div>
                ) : null}
                <div className="detail-card">
                  <span className="detail-label">Full bill</span>
                  <span className="detail-value">{paymentSession.fullBillOptionEnabled ? "Enabled" : "Disabled"}</span>
                </div>
              </div>

              {myShareDiffersFromItems ? (
                <p className="helper-text">
                  Your payable share differs from your own item subtotal because this check is not using &quot;By guest
                  items&quot; split mode.
                </p>
              ) : null}

              {myShare ? (
                <div className="badge-row">
                  <span className={`badge ${paymentShareStatusBadgeClass(myShare.status)}`}>
                    Payment status: {formatPaymentStatus(myShare.status)}
                  </span>
                  <span className="badge badge-outline">{myShare.payerLabel}</span>
                </div>
              ) : null}

              <div className="ticket-actions">
                <button type="button" className="ticket-action-btn" onClick={handlePayMyShare} disabled={!canPayMyShare}>
                  Pay my share
                </button>
                <button type="button" className="ticket-action-btn" onClick={handlePayAll} disabled={!canPayAll}>
                  Pay full bill
                </button>
                <button type="button" className="ticket-action-btn secondary" onClick={handleViewBreakdown}>
                  View check details
                </button>
              </div>

              {!canPayMyShare && mapping.payMyShareDisabledReason ? (
                <p className="helper-text">{mapping.payMyShareDisabledReason}</p>
              ) : null}
            </>
          ) : (
            <div className="selection-summary stack-md">
              <p>
                <strong>Payment has not started yet.</strong>
              </p>
              <p className="helper-text">When cashier prepares the check, your share and payment options will appear here.</p>
            </div>
          )}
        </section>
      ) : (
        <section className="panel">
          <p className="empty empty-state">This table currently has no open session. Ask staff to open the table.</p>
        </section>
      )}

      {showBreakdown && paymentSession ? (
        <section className="panel stack-md">
          <div className="section-copy">
            <h3>Check breakdown</h3>
            <p className="helper-text">This list is informational only. Card details are not collected here.</p>
          </div>

          <div className="list">
            {paymentSession.shares.map((share) => (
              <article key={share.id} className="list-item entity-card stack-md">
                <div className="entity-top">
                  <p>
                    <strong>{share.payerLabel}</strong>
                  </p>
                  <span className="badge badge-outline">{formatTryCurrency(share.amount)}</span>
                </div>
                <div className="badge-row">
                  <span className={`badge ${paymentShareStatusBadgeClass(share.status)}`}>{formatPaymentStatus(share.status)}</span>
                  {share.guestId ? <span className="badge badge-neutral">Guest matched</span> : null}
                </div>
              </article>
            ))}
          </div>

          {identifiedGuestId ? (
            <div className="selection-summary stack-md">
              <div className="section-copy">
                <h4>Your billed items</h4>
                <p className="helper-text">Only the items assigned to your guest profile are listed below.</p>
              </div>
              <div className="badge-row">
                <span className="badge badge-neutral">Items {myInvoiceItemCount}</span>
                <span className="badge badge-outline">{formatTryCurrency(myInvoiceSubtotal)}</span>
              </div>
            </div>
          ) : null}

          <div className="section-copy">
            <h4>{identifiedGuestId ? "Your line items" : "Line items"}</h4>
          </div>
          <div className="list">
            {visibleInvoiceLines.map((line) => (
              <article key={line.id} className="list-item entity-card stack-md">
                <div className="entity-top">
                  <p>
                    <strong>{line.itemName ?? line.label}</strong>
                  </p>
                  <span className="badge badge-outline">{formatTryCurrency(line.amount)}</span>
                </div>
                {line.unitPrice ? (
                  <p className="meta">
                    Qty {resolveLineQuantity(line)} x {formatTryCurrency(line.unitPrice)}
                  </p>
                ) : null}
                {!identifiedGuestId ? (
                  <p className="meta">{line.guestName ? `Guest: ${line.guestName}` : "Shared line item"}</p>
                ) : null}
              </article>
            ))}
            {visibleInvoiceLines.length === 0 ? (
              <p className="empty empty-state">
                {identifiedGuestId ? "No billed item is currently assigned to your guest profile." : "No line-item detail found for this check."}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {isDevelopment && state?.debug ? (
        <section className="panel stack-md">
          <div className="section-copy">
            <h3>Dev trace</h3>
            <p className="helper-text">Visible only in development.</p>
          </div>
          <pre className="debug-trail">{JSON.stringify(state.debug, null, 2)}</pre>
        </section>
      ) : null}
    </div>
  );
}
