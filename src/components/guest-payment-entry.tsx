"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { centsToDecimalString, formatTryCurrency, toCents } from "@/lib/currency";
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

type JoinSessionResponse = {
  data?: {
    guest: {
      id: string;
      displayName: string;
    };
    session: {
      id: string;
    };
    created: boolean;
  };
  error?: string;
};

type Props = {
  tableCode: string;
  initialGuestId?: string;
  backHref?: string;
};

type GuestIdentityState = Pick<GuestIdentityRecord, "guestId" | "guestName" | "sessionId">;
type CheckoutStep = "bill" | "split" | "tip" | "payment";
type SplitChoice = "equal" | "items" | "custom";
type PaymentMethod = "pay" | "card";
type BillGroup = {
  key: string;
  guestId: string | null;
  name: string;
  lines: GuestPaymentEntryLine[];
  subtotalCents: number;
  itemCount: number;
};
type SplitPreviewRow = {
  id: string;
  label: string;
  amountCents: number;
  helper: string;
  isYou?: boolean;
};

const isDevelopment = process.env.NODE_ENV !== "production";
const TIP_PRESET_RATES = [0, 0.07, 0.1, 0.15] as const;
const CHECKOUT_STEPS: Array<{ id: CheckoutStep; label: string }> = [
  { id: "bill", label: "Bill" },
  { id: "split", label: "Split" },
  { id: "tip", label: "Tip" },
  { id: "payment", label: "Payment" }
];
const SPLIT_CHOICES: Array<{ id: SplitChoice; label: string; helper: string }> = [
  { id: "equal", label: "Equal", helper: "Everyone pays the same amount." },
  { id: "items", label: "By Items", helper: "Each guest pays for what they ordered." },
  { id: "custom", label: "Custom", helper: "Use the prepared custom shares." }
];
const PAYMENT_METHODS: Array<{ id: PaymentMethod; label: string; helper: string }> = [
  { id: "pay", label: "Pay with Pay", helper: "Fast wallet handoff" },
  { id: "card", label: "Pay with Card", helper: "Secure card payment" }
];

function formatCents(value: number): string {
  return formatTryCurrency(centsToDecimalString(value));
}

function splitCentsEvenly(totalCents: number, parts: number, index: number): number {
  const safeParts = Math.max(1, parts);
  const base = Math.floor(totalCents / safeParts);
  const remainder = totalCents % safeParts;

  return base + (index < remainder ? 1 : 0);
}

function getLineTitle(line: GuestPaymentEntryLine): string {
  return line.itemName ?? line.label.replace(/\sx\d+$/i, "");
}

function getGuestInitials(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "G";
}

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

function normalizeGuestName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function foldGuestName(value: string): string {
  return normalizeGuestName(value).toLocaleLowerCase("tr-TR");
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

function formatTipPresetLabel(rate: number): string {
  return rate === 0 ? "No tip" : `${Math.round(rate * 100)}%`;
}

function resolveTipAmount(amount: string | null, rate: number): string {
  if (!amount || rate <= 0) {
    return "0.00";
  }

  return centsToDecimalString(Math.round(toCents(amount) * rate));
}

function buildHostedPaymentUrl(paymentUrl: string, tipAmount: string): string {
  const nextUrl = new URL(paymentUrl, window.location.origin);

  if (toCents(tipAmount) > 0) {
    nextUrl.searchParams.set("tip", tipAmount);
  } else {
    nextUrl.searchParams.delete("tip");
  }

  return nextUrl.toString();
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

async function joinTableSession(tableCode: string, displayName: string, reuseGuestId?: string) {
  const response = await fetch("/api/sessions/join", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      tableCode,
      displayName,
      ...(reuseGuestId ? { reuseGuestId } : {})
    })
  });
  const json = (await response.json()) as JoinSessionResponse;

  if (!response.ok || !json.data) {
    throw new Error(json.error || "Failed to join this bill.");
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
  const [showBreakdown, setShowBreakdown] = useState(true);
  const [joinName, setJoinName] = useState("");
  const [joining, setJoining] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("bill");
  const [selectedSplitChoice, setSelectedSplitChoice] = useState<SplitChoice>("equal");
  const [equalPeopleCount, setEqualPeopleCount] = useState(2);
  const [selectedTipRate, setSelectedTipRate] = useState<number>(0);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>("card");

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
  const paymentShare = myShare ?? fullBillShare;
  const identifiedGuestId = state?.identifiedGuest?.id ?? "";
  const mapping = state?.mapping ?? {
    matchSource: null,
    requiresSelection: false,
    message: null,
    payMyShareDisabledReason: null,
    candidates: []
  };
  const joinedGuestNames = useMemo(
    () => state?.session?.guests.map((guest) => guest.displayName).filter(Boolean) ?? [],
    [state?.session?.guests]
  );
  const billGroups = useMemo<BillGroup[]>(() => {
    if (!paymentSession) {
      return [];
    }

    const groups = new Map<string, BillGroup>();

    paymentSession.invoiceLines.forEach((line) => {
      const fallbackName = line.guestName?.trim() || "Shared items";
      const key = line.guestId ?? `name:${fallbackName.toLocaleLowerCase("tr-TR")}`;
      const current =
        groups.get(key) ??
        ({
          key,
          guestId: line.guestId,
          name: line.guestId === identifiedGuestId && state?.identifiedGuest ? state.identifiedGuest.displayName : fallbackName,
          lines: [],
          subtotalCents: 0,
          itemCount: 0
        } satisfies BillGroup);

      current.lines.push(line);
      current.subtotalCents += toCents(line.amount);
      current.itemCount += resolveLineQuantity(line);
      groups.set(key, current);
    });

    if (groups.size === 0) {
      const totalCents = toCents(paymentSession.totalAmount);
      const shareGroups = paymentSession.shares.filter(
        (share) => share.guestId || paymentSession.shares.length === 1 || toCents(share.amount) !== totalCents
      );

      shareGroups.forEach((share) => {
        groups.set(share.id, {
          key: share.id,
          guestId: share.guestId,
          name: share.guestId === identifiedGuestId && state?.identifiedGuest ? state.identifiedGuest.displayName : share.payerLabel,
          lines: [],
          subtotalCents: toCents(share.amount),
          itemCount: 0
        });
      });
    }

    return Array.from(groups.values()).sort((left, right) => {
      if (left.guestId === identifiedGuestId) {
        return -1;
      }

      if (right.guestId === identifiedGuestId) {
        return 1;
      }

      return left.name.localeCompare(right.name, "tr-TR");
    });
  }, [identifiedGuestId, paymentSession, state?.identifiedGuest]);

  const actualPeopleCount = Math.max(1, billGroups.length || joinedGuestNames.length || paymentSession?.shares.length || 2);

  useEffect(() => {
    if (!paymentSession) {
      return;
    }

    setEqualPeopleCount((current) => (current === 2 ? actualPeopleCount : Math.max(1, current)));
  }, [actualPeopleCount, paymentSession]);

  const myInvoiceLines = useMemo(() => {
    if (!paymentSession || !identifiedGuestId) {
      return [];
    }

    return paymentSession.invoiceLines.filter((line) => line.guestId === identifiedGuestId);
  }, [identifiedGuestId, paymentSession]);
  const myInvoiceSubtotalCents = useMemo(
    () => myInvoiceLines.reduce((sum, line) => sum + toCents(line.amount), 0),
    [myInvoiceLines]
  );
  const myInvoiceItemCount = useMemo(
    () => myInvoiceLines.reduce((sum, line) => sum + resolveLineQuantity(line), 0),
    [myInvoiceLines]
  );
  const billLineSubtotalCents = billGroups.reduce((sum, group) => sum + group.subtotalCents, 0);
  const billTotalCents = paymentSession ? toCents(paymentSession.totalAmount) : billLineSubtotalCents;
  const billServiceCents = Math.max(0, billTotalCents - billLineSubtotalCents);
  const splitPreviewRows = useMemo<SplitPreviewRow[]>(() => {
    if (!paymentSession) {
      return [];
    }

    const totalCents = toCents(paymentSession.totalAmount);

    if (selectedSplitChoice === "custom") {
      return paymentSession.shares.map((share) => ({
        id: share.id,
        label: share.guestId === identifiedGuestId && state?.identifiedGuest ? state.identifiedGuest.displayName : share.payerLabel,
        amountCents: toCents(share.amount),
        helper: formatPaymentStatus(share.status),
        isYou: share.guestId === identifiedGuestId
      }));
    }

    if (selectedSplitChoice === "items") {
      const sourceRows =
        billGroups.length > 0
          ? billGroups
          : paymentSession.shares.map((share) => ({
              key: share.id,
              guestId: share.guestId,
              name: share.payerLabel,
              lines: [],
              subtotalCents: toCents(share.amount),
              itemCount: 0
            }));

      return sourceRows.map((group) => ({
        id: group.key,
        label: group.guestId === identifiedGuestId && state?.identifiedGuest ? state.identifiedGuest.displayName : group.name,
        amountCents: group.subtotalCents,
        helper: group.itemCount > 0 ? `${group.itemCount} item${group.itemCount === 1 ? "" : "s"}` : "Prepared share",
        isYou: group.guestId === identifiedGuestId
      }));
    }

    const namedPayers =
      billGroups.length > 0
        ? billGroups.map((group) => ({ id: group.key, name: group.name, guestId: group.guestId }))
        : (state?.session?.guests ?? []).map((guest) => ({ id: guest.id, name: guest.displayName, guestId: guest.id }));
    const count = Math.max(1, equalPeopleCount);

    return Array.from({ length: count }, (_, index) => {
      const payer = namedPayers[index] ?? null;
      const isYou = payer?.guestId === identifiedGuestId;

      return {
        id: payer?.id ?? `equal-${index}`,
        label: payer?.name ?? (index === 0 && state?.identifiedGuest ? state.identifiedGuest.displayName : `Guest ${index + 1}`),
        amountCents: splitCentsEvenly(totalCents, count, index),
        helper: "Equal share",
        isYou
      };
    });
  }, [billGroups, equalPeopleCount, identifiedGuestId, paymentSession, selectedSplitChoice, state?.identifiedGuest, state?.session?.guests]);
  const selectedTipAmount = useMemo(
    () => resolveTipAmount(paymentShare?.amount ?? null, selectedTipRate),
    [paymentShare?.amount, selectedTipRate]
  );
  const selectedTipCents = toCents(selectedTipAmount);
  const paymentBaseCents = paymentShare ? toCents(paymentShare.amount) : 0;
  const paymentTotalCents = paymentBaseCents + selectedTipCents;
  const currentStepIndex = CHECKOUT_STEPS.findIndex((step) => step.id === checkoutStep);
  const myShareDiffersFromItems = Boolean(
    myShare && identifiedGuestId && Math.abs(toCents(myShare.amount) - myInvoiceSubtotalCents) > 1
  );

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
      setMessage("Online payment is not ready yet. Ask restaurant staff to send the payment link.");
      return;
    }

    const tipAmount = resolveTipAmount(share.amount, selectedTipRate);
    window.location.assign(buildHostedPaymentUrl(share.paymentUrl, tipAmount));
  }

  function handleContinue(nextStep: CheckoutStep) {
    setMessage("");

    if (!paymentSession) {
      setMessage("The restaurant has not sent this bill to payment yet.");
      return;
    }

    setCheckoutStep(nextStep);
  }

  function handlePaymentMethod(method: PaymentMethod) {
    setSelectedPaymentMethod(method);
    routeToHostedPayment(paymentShare, mapping.payMyShareDisabledReason ?? "Your payment share is not ready yet.");
  }

  function handlePayFullBill() {
    routeToHostedPayment(fullBillShare, "Pay full bill option is not available for this check.");
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

  function handleResetGuest() {
    persistIdentity(null);
    setJoinName("");
    setMessage("Select or enter the correct guest name to continue.");
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!state?.session) {
      return;
    }

    const requestedName = normalizeGuestName(joinName);

    if (!requestedName) {
      setError("Enter your name to connect this phone to the bill.");
      return;
    }

    setJoining(true);
    setError("");
    setMessage("");

    try {
      const reusableGuest =
        state.session.guests.find((guest) => foldGuestName(guest.displayName) === foldGuestName(requestedName)) ?? null;

      if (reusableGuest) {
        persistIdentity({
          guestId: reusableGuest.id,
          guestName: reusableGuest.displayName,
          sessionId: state.session.id
        });
        setJoinName("");
        setMessage(`Continuing as ${reusableGuest.displayName}.`);
        return;
      }

      const result = await joinTableSession(tableCode, requestedName);
      persistIdentity({
        guestId: result.guest.id,
        guestName: result.guest.displayName,
        sessionId: result.session.id
      });
      setJoinName("");
      setMessage(`${result.created ? "Joined" : "Continuing"} as ${result.guest.displayName}.`);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Failed to join this bill.");
    } finally {
      setJoining(false);
    }
  }

  function renderGuestSelector() {
    if (mapping.candidates.length === 0) {
      return null;
    }

    return (
      <div className="guest-checkout-candidates">
        {mapping.candidates.map((candidate) => {
          const candidateShareMeta = candidate.hasPaymentShare
            ? `${candidate.shareAmount ? formatTryCurrency(candidate.shareAmount) : "-"} | ${candidate.shareStatus ? formatPaymentStatus(candidate.shareStatus) : "Ready"}`
            : paymentSession
              ? "No active share found"
              : "Share is being prepared";

          return (
            <button
              key={candidate.id}
              type="button"
              className="guest-checkout-candidate"
              onClick={() => handleSelectGuest(candidate)}
            >
              <span>{candidate.displayName}</span>
              <small>{candidateShareMeta}</small>
            </button>
          );
        })}
      </div>
    );
  }

  function renderIdentityCard() {
    if (!state?.session) {
      return null;
    }

    if (state.identifiedGuest) {
      return (
        <div className="guest-checkout-identity">
          <div className="guest-checkout-person">
            <span className="guest-checkout-avatar">{getGuestInitials(state.identifiedGuest.displayName)}</span>
            <span>
              <small>Paying as</small>
              <strong>{state.identifiedGuest.displayName}</strong>
            </span>
          </div>
          <div className="guest-checkout-identity-meta">
            {myShare ? (
              <span className={`guest-checkout-pill ${paymentShareStatusBadgeClass(myShare.status)}`}>
                {formatTryCurrency(myShare.amount)}
              </span>
            ) : (
              <span className="guest-checkout-pill is-muted">No share yet</span>
            )}
            {mapping.matchSource ? <small>Matched by {formatMatchSource(mapping.matchSource)}</small> : null}
          </div>
          <button type="button" className="guest-checkout-text-btn" onClick={handleResetGuest}>
            Change
          </button>
        </div>
      );
    }

    return (
      <div className="guest-checkout-join-card">
        <div>
          <h3>Connect this phone</h3>
          <p>{mapping.message ?? "Enter the guest name that should pay from this phone."}</p>
        </div>
        <form className="guest-checkout-join-form" onSubmit={handleJoin}>
          <input
            type="text"
            value={joinName}
            onChange={(event) => setJoinName(event.target.value)}
            placeholder="Your name"
            autoComplete="name"
          />
          <button type="submit" disabled={joining || !state.session}>
            {joining ? "Connecting..." : "Connect"}
          </button>
        </form>
        {renderGuestSelector()}
      </div>
    );
  }

  function renderBillStep() {
    return (
      <section className="guest-checkout-screen">
        <div className="guest-checkout-title">
          <span>Live bill</span>
          <h1>Yerevan Tavern</h1>
          <p>{state ? `Table ${state.table.name}` : "Table bill"}</p>
        </div>

        {renderIdentityCard()}

        <div className="guest-checkout-person-list">
          {billGroups.map((group, index) => {
            const isYou = group.guestId === identifiedGuestId;
            const visibleLines = showBreakdown ? group.lines : group.lines.slice(0, 2);

            return (
              <article key={group.key} className={`guest-person-bill${isYou ? " is-you" : ""}`}>
                <div className="guest-person-bill-head">
                  <span className="guest-person-bill-avatar">{getGuestInitials(group.name)}</span>
                  <div>
                    <h3>{isYou ? "You" : group.name}</h3>
                    <p>{group.itemCount > 0 ? `${group.itemCount} ordered item${group.itemCount === 1 ? "" : "s"}` : "Prepared share"}</p>
                  </div>
                  <strong>{formatCents(group.subtotalCents)}</strong>
                </div>

                <div className="guest-person-line-list">
                  {visibleLines.map((line) => (
                    <div key={line.id} className="guest-person-line">
                      <span>
                        {getLineTitle(line)}
                        {resolveLineQuantity(line) > 1 ? ` x${resolveLineQuantity(line)}` : ""}
                      </span>
                      <strong>{formatTryCurrency(line.amount)}</strong>
                    </div>
                  ))}
                  {group.lines.length === 0 ? <p>Payment share prepared by the restaurant.</p> : null}
                  {!showBreakdown && group.lines.length > 2 ? <p>{group.lines.length - 2} more item(s)</p> : null}
                </div>
              </article>
            );
          })}
          {billGroups.length === 0 ? <p className="guest-checkout-empty">No bill lines found for this table yet.</p> : null}
        </div>

        {billGroups.some((group) => group.lines.length > 2) ? (
          <button type="button" className="guest-checkout-secondary-action" onClick={() => setShowBreakdown((current) => !current)}>
            {showBreakdown ? "Show compact bill" : "Show all items"}
          </button>
        ) : null}

        <div className="guest-checkout-total-card">
          <div>
            <span>Subtotal</span>
            <strong>{formatCents(billLineSubtotalCents)}</strong>
          </div>
          <div>
            <span>Service</span>
            <strong>{formatCents(billServiceCents)}</strong>
          </div>
          <div className="is-total">
            <span>Total</span>
            <strong>{formatCents(billTotalCents)}</strong>
          </div>
        </div>

        <button type="button" className="guest-checkout-primary-action" onClick={() => handleContinue("split")} disabled={!paymentSession}>
          Split the Bill
        </button>
      </section>
    );
  }

  function renderSplitStep() {
    const activeSplit = SPLIT_CHOICES.find((choice) => choice.id === selectedSplitChoice) ?? SPLIT_CHOICES[0];

    return (
      <section className="guest-checkout-screen">
        <div className="guest-checkout-title">
          <span>Split the bill</span>
          <h1>Choose split</h1>
          <p>{activeSplit.helper}</p>
        </div>

        <div className="guest-split-tabs" role="tablist" aria-label="Split method">
          {SPLIT_CHOICES.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className={selectedSplitChoice === choice.id ? "is-active" : ""}
              onClick={() => setSelectedSplitChoice(choice.id)}
            >
              {choice.label}
            </button>
          ))}
        </div>

        {selectedSplitChoice === "equal" ? (
          <div className="guest-split-people">
            <span>Number of people</span>
            <div>
              <button type="button" onClick={() => setEqualPeopleCount((current) => Math.max(1, current - 1))}>
                -
              </button>
              <strong>{equalPeopleCount}</strong>
              <button type="button" onClick={() => setEqualPeopleCount((current) => current + 1)}>
                +
              </button>
            </div>
          </div>
        ) : null}

        <div className="guest-split-list">
          <p className="guest-checkout-label">Each person pays</p>
          {splitPreviewRows.map((row, index) => (
            <article key={`${row.id}-${index}`} className={`guest-split-row${row.isYou ? " is-you" : ""}`}>
              <div>
                <span className="guest-split-avatar">{getGuestInitials(row.isYou ? "You" : row.label)}</span>
                <span>
                  <strong>{row.isYou ? "You" : row.label}</strong>
                  <small>{row.helper}</small>
                </span>
              </div>
              <strong>{formatCents(row.amountCents)}</strong>
            </article>
          ))}
        </div>

        <div className="guest-checkout-total-card is-slim">
          <div className="is-total">
            <span>Total</span>
            <strong>{formatCents(billTotalCents)}</strong>
          </div>
        </div>

        <div className="guest-step-actions">
          <button type="button" className="guest-checkout-secondary-action" onClick={() => setCheckoutStep("bill")}>
            Back
          </button>
          <button type="button" className="guest-checkout-primary-action" onClick={() => handleContinue("tip")}>
            Continue to Tip
          </button>
        </div>
      </section>
    );
  }

  function renderTipStep() {
    return (
      <section className="guest-checkout-screen">
        <div className="guest-checkout-title">
          <span>Add a tip</span>
          <h1>Tip your waiter</h1>
          <p>{paymentShare ? `Based on ${formatTryCurrency(paymentShare.amount)}` : "Choose a tip after your share is ready."}</p>
        </div>

        <div className="guest-tip-grid">
          {TIP_PRESET_RATES.map((rate) => {
            const tipAmount = resolveTipAmount(paymentShare?.amount ?? null, rate);
            const isActive = selectedTipRate === rate;

            return (
              <button
                key={rate}
                type="button"
                className={isActive ? "is-active" : ""}
                onClick={() => setSelectedTipRate(rate)}
                disabled={!paymentShare}
              >
                <span>{formatTipPresetLabel(rate)}</span>
                <strong>{rate === 0 ? "No extra charge" : formatTryCurrency(tipAmount)}</strong>
              </button>
            );
          })}
        </div>

        <div className="guest-checkout-total-card">
          <div>
            <span>Your share</span>
            <strong>{formatCents(paymentBaseCents)}</strong>
          </div>
          <div>
            <span>Tip</span>
            <strong>{formatCents(selectedTipCents)}</strong>
          </div>
          <div className="is-total">
            <span>Total with tip</span>
            <strong>{formatCents(paymentTotalCents)}</strong>
          </div>
        </div>

        <div className="guest-step-actions">
          <button type="button" className="guest-checkout-secondary-action" onClick={() => setCheckoutStep("split")}>
            Back
          </button>
          <button type="button" className="guest-checkout-primary-action" onClick={() => handleContinue("payment")} disabled={!paymentShare}>
            Continue to Payment
          </button>
        </div>
      </section>
    );
  }

  function renderPaymentStep() {
    return (
      <section className="guest-checkout-screen">
        <div className="guest-checkout-title">
          <span>Payment</span>
          <h1>{formatCents(paymentTotalCents)}</h1>
          <p>{paymentShare ? paymentShare.payerLabel : "Connect your name before payment."}</p>
        </div>

        <div className="guest-payment-summary">
          <div>
            <span>Base share</span>
            <strong>{formatCents(paymentBaseCents)}</strong>
          </div>
          <div>
            <span>Tip</span>
            <strong>{formatCents(selectedTipCents)}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{paymentShare ? formatPaymentStatus(paymentShare.status) : "Not ready"}</strong>
          </div>
        </div>

        {myShareDiffersFromItems ? (
          <p className="guest-checkout-note">Your payable share differs from your item subtotal because the prepared split is not by items.</p>
        ) : null}

        <div className="guest-payment-methods">
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method.id}
              type="button"
              className={selectedPaymentMethod === method.id ? "is-active" : ""}
              onClick={() => handlePaymentMethod(method.id)}
              disabled={!paymentShare || paymentShare.status === "PAID"}
            >
              <span>{method.label}</span>
              <small>{method.helper}</small>
            </button>
          ))}
        </div>

        {fullBillShare && fullBillShare.id !== paymentShare?.id ? (
          <button type="button" className="guest-checkout-secondary-action" onClick={handlePayFullBill} disabled={fullBillShare.status === "PAID"}>
            Pay full bill instead
          </button>
        ) : null}

        <button type="button" className="guest-checkout-secondary-action" onClick={() => setCheckoutStep("tip")}>
          Back to Tip
        </button>
      </section>
    );
  }

  return (
    <div className="guest-checkout-app">
      <section className="guest-checkout-phone">
        <header className="guest-checkout-header">
          <div>
            <span>GLANA</span>
            <strong>{state ? `Table ${state.table.name}` : "Split payment"}</strong>
            {state?.session && paymentSession ? (
              <small>
                {formatSplitModeLabel(paymentSession.splitMode)} | Opened {formatDateTime(state.session.openedAt)}
              </small>
            ) : null}
          </div>
          <div className="guest-checkout-header-actions">
            {paymentSession ? (
              <span className={`guest-checkout-pill ${paymentSessionStatusBadgeClass(paymentSession.status)}`}>
                {formatPaymentStatus(paymentSession.status)}
              </span>
            ) : null}
            {backHref ? (
              <Link href={backHref} className="guest-checkout-link">
                Back
              </Link>
            ) : null}
            <button type="button" onClick={() => void load()}>
              Refresh
            </button>
          </div>
        </header>

        <nav className="guest-checkout-progress" aria-label="Checkout steps">
          {CHECKOUT_STEPS.map((step, index) => (
            <button
              key={step.id}
              type="button"
              className={`${checkoutStep === step.id ? "is-active" : ""}${currentStepIndex > index ? " is-complete" : ""}`}
              onClick={() => (paymentSession ? setCheckoutStep(step.id) : undefined)}
              disabled={!paymentSession}
            >
              <span>{index + 1}</span>
              <small>{step.label}</small>
            </button>
          ))}
        </nav>

        <div className="guest-checkout-status-stack">
          {loading ? <p className="guest-checkout-status is-neutral">Loading payment details.</p> : null}
          {error ? <p className="guest-checkout-status is-error">{error}</p> : null}
          {message ? <p className="guest-checkout-status is-neutral">{message}</p> : null}
        </div>

        {state?.session && paymentSession ? (
          <>
            {checkoutStep === "bill" ? renderBillStep() : null}
            {checkoutStep === "split" ? renderSplitStep() : null}
            {checkoutStep === "tip" ? renderTipStep() : null}
            {checkoutStep === "payment" ? renderPaymentStep() : null}
          </>
        ) : (
          <section className="guest-checkout-screen">
            <div className="guest-checkout-title">
              <span>Bill</span>
              <h1>{state?.session ? "Bill is being prepared" : "No live bill yet"}</h1>
              <p>
                {state?.session
                  ? "As soon as the restaurant sends the check from the POS, split options and payment will appear here."
                  : "Ask staff to open the table and send the bill from the POS."}
              </p>
            </div>
            {renderIdentityCard()}
          </section>
        )}
      </section>

      {isDevelopment && state?.debug ? (
        <section className="guest-checkout-dev">
          <h3>Dev trace</h3>
          <pre className="debug-trail">{JSON.stringify(state.debug, null, 2)}</pre>
        </section>
      ) : null}
    </div>
  );
}
