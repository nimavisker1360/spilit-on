"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { useDashboardLanguage } from "@/components/layout/dashboard-language";
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
  userId: string | null;
  guestId: string | null;
  payerLabel: string;
  amount: string;
  tip: string;
  status: PaymentShareStatus;
  paymentUrl: string | null;
  provider: string | null;
  paidAt: string | null;
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
    status: "OPEN" | "CLOSED";
    openedAt: string;
    closedAt: string | null;
    totalAmount: string;
    paidAmount: string;
    remainingAmount: string;
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

type GuestPaymentActionResponse = {
  data?: {
    message: string;
    paymentPageUrl?: string;
  };
  error?: string;
};

type Props = {
  tableCode: string;
  initialGuestId?: string;
  handoffMode?: string;
  initialStep?: string;
  initialPaymentStatus?: string;
  initialPaymentError?: string;
};

type GuestIdentityState = Pick<GuestIdentityRecord, "guestId" | "guestName" | "sessionId">;
type CheckoutStep = "bill" | "split" | "tip" | "payment";
type SplitChoice = "equal" | "items" | "custom";
type PaymentMethod = "card";
type PendingGuestNavigation = {
  guestId: string;
  step: Extract<CheckoutStep, "split" | "payment">;
};
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
  shareStatus?: PaymentShareStatus;
  isYou?: boolean;
};

function buildGuestQrOpenedStorageKey(tableCode: string) {
  return `guest-qr-opened:${tableCode.trim().toUpperCase()}`;
}

async function notifyGuestQrOpened(tableCode: string) {
  await fetch(`/api/guest/${encodeURIComponent(tableCode)}/opened`, {
    method: "POST",
    cache: "no-store"
  });
}

const TIP_PRESET_RATES = [0, 0.07, 0.1, 0.15] as const;
const HOST_ROLE_LABEL = "Host";
const GUEST_ROLE_LABEL = "Guest";
const CHECKOUT_STEPS: Array<{ id: CheckoutStep; label: string }> = [
  { id: "bill", label: "Hesap" },
  { id: "split", label: "Bol" },
  { id: "tip", label: "Bahsis" },
  { id: "payment", label: "Odeme" }
];
const SPLIT_CHOICES: Array<{ id: SplitChoice; label: string; helper: string }> = [
  { id: "equal", label: "Equal", helper: "Everyone pays the same amount." },
  { id: "items", label: "By Items", helper: "Each guest pays for what they ordered." },
  { id: "custom", label: "Custom", helper: "Use the prepared custom shares." }
];
const PAYMENT_METHODS: Array<{ id: PaymentMethod; label: string; helper: string }> = [
  { id: "card", label: "Kart ile ode", helper: "iyzico guvenli odeme sayfasi" }
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
    return "Kismi odendi";
  }

  if (value === "PAID") {
    return "Odendi";
  }

  if (value === "FAILED") {
    return "Odeme basarisiz";
  }

  if (value === "EXPIRED") {
    return "Expired";
  }

  if (value === "UNPAID") {
    return "Odenmedi";
  }

  if (value === "PENDING") {
    return "Odeme isleniyor";
  }

  if (value === "CANCELLED") {
    return "Iptal edildi";
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

function isSharePayable(status: PaymentShareStatus): boolean {
  return status === "UNPAID" || status === "FAILED";
}

function isCandidatePayable(status: PaymentShareStatus | null): boolean {
  return status === "UNPAID" || status === "FAILED" || status === "PENDING";
}

function isPaidStatus(status: PaymentShareStatus | null | undefined): boolean {
  return status === "PAID";
}

function candidatePaymentPriority(status: PaymentShareStatus | null): number {
  if (status === "UNPAID") {
    return 0;
  }

  if (status === "FAILED") {
    return 1;
  }

  if (status === "PENDING") {
    return 2;
  }

  return 3;
}

function hasPendingPaymentLink(share: GuestPaymentEntryShare | null): share is GuestPaymentEntryShare & { paymentUrl: string } {
  return Boolean(share?.status === "PENDING" && share.paymentUrl);
}

function canOpenPaymentShare(share: GuestPaymentEntryShare | null): boolean {
  return Boolean(share && (isSharePayable(share.status) || hasPendingPaymentLink(share)));
}

function paymentMethodLabel(share: GuestPaymentEntryShare | null, payingShareId: string | null): string {
  if (payingShareId === share?.id) {
    return "Odeme isleniyor";
  }

  if (hasPendingPaymentLink(share)) {
    return "Odemeye devam et";
  }

  return "Kart ile ode";
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

function resolveInitialCheckoutStep(handoffMode: string, initialStep: string): CheckoutStep {
  if (initialStep === "bill" || initialStep === "split" || initialStep === "tip" || initialStep === "payment") {
    return initialStep;
  }

  if (handoffMode === "next") {
    return "split";
  }

  if (handoffMode === "retry") {
    return "payment";
  }

  return "bill";
}

function resolveTipPresetRate(amount: string | null, tip: string | null | undefined): number | null {
  if (!amount || !tip) {
    return 0;
  }

  const amountCents = toCents(amount);
  const tipCents = toCents(tip);

  if (amountCents <= 0 || tipCents <= 0) {
    return 0;
  }

  return TIP_PRESET_RATES.find((rate) => toCents(resolveTipAmount(amount, rate)) === tipCents) ?? null;
}

function normalizeReturnedPaymentError(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("[{") || trimmed.includes('"code": "invalid_') || trimmed.includes('"path": ["tip"]')) {
    return "Odeme tamamlanamadi. Lutfen tekrar deneyin.";
  }

  return trimmed;
}

function resolveTipAmount(amount: string | null, rate: number): string {
  if (!amount || rate <= 0) {
    return "0.00";
  }

  return centsToDecimalString(Math.round(toCents(amount) * rate));
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

async function payPaymentShare(shareId: string, input: { userId?: string | null; guestId?: string | null; tip: string }) {
  const response = await fetch(`/api/payment-shares/${encodeURIComponent(shareId)}/pay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
  const json = (await response.json()) as GuestPaymentActionResponse;

  if (!response.ok || !json.data) {
    throw new Error(json.error || "Odeme basarisiz.");
  }

  return json.data;
}

export function GuestPaymentEntry({
  tableCode,
  initialGuestId = "",
  handoffMode = "",
  initialStep = "",
  initialPaymentStatus = "",
  initialPaymentError = ""
}: Props) {
  const { locale, t } = useDashboardLanguage();
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
  const [showAddGuestForm, setShowAddGuestForm] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>(() => resolveInitialCheckoutStep(handoffMode, initialStep));
  const [selectedSplitChoice, setSelectedSplitChoice] = useState<SplitChoice>("equal");
  const [equalPeopleCount, setEqualPeopleCount] = useState(2);
  const [selectedTipRate, setSelectedTipRate] = useState<number>(0);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>("card");
  const [payingShareId, setPayingShareId] = useState<string | null>(null);
  const [pendingGuestNavigation, setPendingGuestNavigation] = useState<PendingGuestNavigation | null>(null);
  const localeCode = locale === "tr" ? "tr-TR" : "en-US";
  const hostRoleLabel = t("Host", "Host");
  const guestRoleLabel = t("Guest", "Misafir");
  const checkoutSteps = useMemo<Array<{ id: CheckoutStep; label: string }>>(
    () => [
      { id: "bill", label: t("Bill", "Hesap") },
      { id: "split", label: t("Split", "Bol") },
      { id: "tip", label: t("Tip", "Bahsis") },
      { id: "payment", label: t("Payment", "Odeme") }
    ],
    [t]
  );
  const splitChoices = useMemo<Array<{ id: SplitChoice; label: string; helper: string }>>(
    () => [
      { id: "equal", label: t("Equal", "Esit"), helper: t("Everyone pays the same amount.", "Herkes ayni tutari oder.") },
      { id: "items", label: t("By Items", "Urunlere gore"), helper: t("Each guest pays for what they ordered.", "Her misafir kendi siparis ettiklerini oder.") },
      { id: "custom", label: t("Custom", "Hazir pay"), helper: t("Use the prepared custom shares.", "Hazirlanan ozel paylari kullanin.") }
    ],
    [t]
  );
  const paymentMethods = useMemo<Array<{ id: PaymentMethod; label: string; helper: string }>>(
    () => [{ id: "card", label: t("Pay by card", "Kart ile ode"), helper: t("iyzico secure payment page", "iyzico guvenli odeme sayfasi") }],
    [t]
  );
  const formatDateTimeValue = useCallback((value: string) => new Date(value).toLocaleString(localeCode), [localeCode]);
  const formatSplitModeLabelValue = useCallback(
    (mode: SplitMode) => {
      if (mode === "FULL_BY_ONE") return t("Full bill", "Tum hesap");
      if (mode === "BY_GUEST_ITEMS") return t("By guest items", "Misafir urunlerine gore");
      return t("Equal split", "Esit bolme");
    },
    [t]
  );
  const formatPaymentStatusValue = useCallback(
    (value: string) => {
      if (value === "OPEN") return t("Open", "Acik");
      if (value === "PARTIALLY_PAID") return t("Partially paid", "Kismen odendi");
      if (value === "PAID") return t("Paid", "Odendi");
      if (value === "FAILED") return t("Payment failed", "Odeme basarisiz");
      if (value === "EXPIRED") return t("Expired", "Suresi doldu");
      if (value === "UNPAID") return t("Unpaid", "Odenmedi");
      if (value === "PENDING") return t("Payment processing", "Odeme isleniyor");
      if (value === "CANCELLED") return t("Cancelled", "Iptal edildi");
      return value;
    },
    [t]
  );
  const formatTipPresetLabelValue = useCallback((rate: number) => (rate === 0 ? t("No tip", "Bahsis yok") : `${Math.round(rate * 100)}%`), [t]);
  const paymentMethodLabelValue = useCallback(
    (share: GuestPaymentEntryShare | null, activeShareId: string | null) => {
      if (activeShareId === share?.id) {
        return t("Payment processing", "Odeme isleniyor");
      }

      if (hasPendingPaymentLink(share)) {
        return t("Continue payment", "Odemeye devam et");
      }

      return t("Pay by card", "Kart ile ode");
    },
    [t]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storageKey = buildGuestQrOpenedStorageKey(tableCode);

    if (window.sessionStorage.getItem(storageKey) === "true") {
      return;
    }

    window.sessionStorage.setItem(storageKey, "true");
    void notifyGuestQrOpened(tableCode);
  }, [tableCode]);
  const [seenPaymentSessionId, setSeenPaymentSessionId] = useState<string | null>(null);
  const [handoffConsumed, setHandoffConsumed] = useState(false);
  const [returnStateApplied, setReturnStateApplied] = useState(false);

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

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
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
      setError(loadError instanceof Error ? loadError.message : t("Failed to load payment details.", "Odeme detaylari yuklenemedi."));
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [identity, persistIdentity, t, tableCode]);

  useEffect(() => {
    void load();
    const intervalId = window.setInterval(() => {
      void load({ silent: true });
    }, 3000);

    return () => window.clearInterval(intervalId);
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
  const hostGuestId = useMemo(() => state?.session?.guests[0]?.id ?? "", [state?.session?.guests]);
  const getGuestRoleLabel = useCallback(
    (guestId: string | null | undefined) => (guestId && guestId === hostGuestId ? hostRoleLabel : guestRoleLabel),
    [guestRoleLabel, hostGuestId, hostRoleLabel]
  );
  const getGuestRoleClassName = useCallback(
    (guestId: string | null | undefined) => `guest-checkout-role${guestId && guestId === hostGuestId ? " is-host" : ""}`,
    [hostGuestId]
  );
  const nextPaymentCandidates = useMemo(
    () =>
      mapping.candidates
        .filter((candidate) => candidate.id !== identifiedGuestId && candidate.hasPaymentShare && isCandidatePayable(candidate.shareStatus))
        .sort((left, right) => {
          const priorityDifference = candidatePaymentPriority(left.shareStatus) - candidatePaymentPriority(right.shareStatus);

          if (priorityDifference !== 0) {
            return priorityDifference;
          }

          return left.displayName.localeCompare(right.displayName, "tr-TR");
        }),
    [identifiedGuestId, mapping.candidates]
  );
  const nextPayableGuestCandidate = nextPaymentCandidates[0] ?? null;
  const billGroups = useMemo<BillGroup[]>(() => {
    if (!paymentSession) {
      return [];
    }

    const groups = new Map<string, BillGroup>();

    paymentSession.invoiceLines.forEach((line) => {
      const fallbackName = line.guestName?.trim() || t("Shared items", "Paylasilan urunler");
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
  }, [identifiedGuestId, paymentSession, state?.identifiedGuest, t]);

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
        helper: formatPaymentStatusValue(share.status),
        shareStatus: share.status,
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

      return sourceRows.map((group) => {
        const share = paymentSession.shares.find((entry) => (group.guestId ? entry.guestId === group.guestId : entry.payerLabel === group.name));

        return {
          id: group.key,
          label: group.guestId === identifiedGuestId && state?.identifiedGuest ? state.identifiedGuest.displayName : group.name,
          amountCents: group.subtotalCents,
          helper: group.itemCount > 0 ? t(`${group.itemCount} item${group.itemCount === 1 ? "" : "s"}`, `${group.itemCount} urun`) : t("Prepared share", "Hazirlanan pay"),
          shareStatus: share?.status,
          isYou: group.guestId === identifiedGuestId
        };
      });
    }

    const namedPayers =
      billGroups.length > 0
        ? billGroups.map((group) => ({ id: group.key, name: group.name, guestId: group.guestId }))
        : (state?.session?.guests ?? []).map((guest) => ({ id: guest.id, name: guest.displayName, guestId: guest.id }));
    const count = Math.max(1, equalPeopleCount);

    return Array.from({ length: count }, (_, index) => {
      const payer = namedPayers[index] ?? null;
      const isYou = payer?.guestId === identifiedGuestId;
      const share = paymentSession.shares.find((entry) => (payer?.guestId ? entry.guestId === payer.guestId : entry.payerLabel === payer?.name));

      return {
        id: payer?.id ?? `equal-${index}`,
        label: payer?.name ?? (index === 0 && state?.identifiedGuest ? state.identifiedGuest.displayName : t(`Guest ${index + 1}`, `Misafir ${index + 1}`)),
        amountCents: splitCentsEvenly(totalCents, count, index),
        helper: t("Equal share", "Esit pay"),
        shareStatus: share?.status,
        isYou
      };
    });
  }, [billGroups, equalPeopleCount, identifiedGuestId, paymentSession, selectedSplitChoice, state?.identifiedGuest, state?.session?.guests, t, formatPaymentStatusValue]);
  const selectedTipAmount = useMemo(
    () => resolveTipAmount(paymentShare?.amount ?? null, selectedTipRate),
    [paymentShare?.amount, selectedTipRate]
  );
  const selectedTipCents = toCents(selectedTipAmount);
  const paymentBaseCents = paymentShare ? toCents(paymentShare.amount) : 0;
  const paymentTotalCents = paymentBaseCents + selectedTipCents;
  const currentStepIndex = checkoutSteps.findIndex((step) => step.id === checkoutStep);
  const myShareDiffersFromItems = Boolean(
    myShare && identifiedGuestId && Math.abs(toCents(myShare.amount) - myInvoiceSubtotalCents) > 1
  );
  const isCheckoutClosed = Boolean(paymentSession?.status === "PAID" || state?.session?.status === "CLOSED");
  const hasPayablePaymentShare = canOpenPaymentShare(paymentShare) && !isCheckoutClosed;

  useEffect(() => {
    if (!paymentSession) {
      setSeenPaymentSessionId(null);
      return;
    }

    if (seenPaymentSessionId === paymentSession.id) {
      return;
    }

    setSeenPaymentSessionId(paymentSession.id);

    if (handoffMode === "next" || handoffMode === "retry" || initialStep === "payment" || isCheckoutClosed) {
      return;
    }

    setCheckoutStep("split");
  }, [handoffMode, initialStep, isCheckoutClosed, paymentSession, seenPaymentSessionId]);

  useEffect(() => {
    if (returnStateApplied || !paymentSession || !paymentShare || isCheckoutClosed) {
      return;
    }

    const normalizedError = normalizeReturnedPaymentError(initialPaymentError);
    const returnedTipRate = resolveTipPresetRate(paymentShare.amount, paymentShare.tip);

    if (initialStep === "payment" || handoffMode === "retry") {
      setCheckoutStep("payment");

      if (returnedTipRate !== null) {
        setSelectedTipRate(returnedTipRate);
      }
    }

    if (initialPaymentStatus.toLowerCase() === "failed") {
      setMessage(t("Payment failed. Please try again.", "Odeme basarisiz. Lutfen tekrar deneyin."));
    }

    if (normalizedError) {
      setError(normalizedError);
    }

    if (initialPaymentStatus || normalizedError || initialStep === "payment" || handoffMode === "retry") {
      setReturnStateApplied(true);
    }
  }, [
    handoffMode,
    initialPaymentError,
    initialPaymentStatus,
    initialStep,
    isCheckoutClosed,
    paymentSession,
    paymentShare,
    returnStateApplied,
    t
  ]);

  useEffect(() => {
    if (!pendingGuestNavigation || identifiedGuestId !== pendingGuestNavigation.guestId || !paymentSession) {
      return;
    }

    setPendingGuestNavigation(null);

    if (pendingGuestNavigation.step === "payment" && canOpenPaymentShare(paymentShare) && !isCheckoutClosed) {
      setCheckoutStep("payment");
      return;
    }

    setCheckoutStep("split");
  }, [identifiedGuestId, isCheckoutClosed, paymentSession, paymentShare, pendingGuestNavigation]);

  useEffect(() => {
    if (
      handoffMode !== "next" ||
      handoffConsumed ||
      !state?.session ||
      !paymentSession ||
      isCheckoutClosed ||
      myShare?.status !== "PAID" ||
      !nextPayableGuestCandidate
    ) {
      return;
    }

    setHandoffConsumed(true);
    setShowAddGuestForm(false);
    setJoinName("");
    setSelectedTipRate(0);
    setPendingGuestNavigation({
      guestId: nextPayableGuestCandidate.id,
      step: "split"
    });
    setMessage(t(`Next payer: ${nextPayableGuestCandidate.displayName}.`, `Siradaki odeyecek kisi: ${nextPayableGuestCandidate.displayName}.`));
    setError("");
    persistIdentity({
      guestId: nextPayableGuestCandidate.id,
      guestName: nextPayableGuestCandidate.displayName,
      sessionId: state.session.id
    });
  }, [
    handoffConsumed,
    handoffMode,
    isCheckoutClosed,
    myShare?.status,
    nextPayableGuestCandidate,
    paymentSession,
    persistIdentity,
    state?.session,
    t
  ]);

  async function handlePayShare(share: GuestPaymentEntryShare | null, fallback: string) {
    setMessage("");

    if (!share) {
      setMessage(fallback);
      return;
    }

    if (isCheckoutClosed || share.status === "PAID") {
      setMessage(t("Payment successful.", "Odeme basarili."));
      return;
    }

    if (!isSharePayable(share.status) && !hasPendingPaymentLink(share)) {
      setMessage(t("Payment processing.", "Odeme isleniyor."));
      return;
    }

    setPayingShareId(share.id);
    setError("");

    try {
      const result = await payPaymentShare(share.id, {
        userId: identity?.guestId || identifiedGuestId || share.userId || share.guestId || null,
        guestId: share.guestId || identity?.guestId || identifiedGuestId || null,
        tip: resolveTipAmount(share.amount, selectedTipRate)
      });

      if (result.paymentPageUrl) {
        window.location.assign(result.paymentPageUrl);
        return;
      }

      setMessage(result.message || t("Payment processing.", "Odeme isleniyor."));
      await load({ silent: true });
    } catch (payError) {
      setError(payError instanceof Error ? payError.message : t("Payment failed.", "Odeme basarisiz."));
    } finally {
      setPayingShareId(null);
    }
  }

  function handleContinue(nextStep: CheckoutStep) {
    setMessage("");

    if (!paymentSession) {
      setMessage(t("The restaurant has not opened this bill for payment yet.", "Restoran henuz bu hesabi odemeye acmadi."));
      return;
    }

    setCheckoutStep(nextStep);
  }

  function handlePaymentMethod(method: PaymentMethod) {
    setSelectedPaymentMethod(method);
    void handlePayShare(paymentShare, mapping.payMyShareDisabledReason ?? t("Your payment share is not ready yet.", "Odeme payiniz henuz hazir degil."));
  }

  function handleContinueToIyzico() {
    void handlePayShare(paymentShare, mapping.payMyShareDisabledReason ?? t("Your payment share is not ready yet.", "Odeme payiniz henuz hazir degil."));
  }

  function handlePayFullBill() {
    void handlePayShare(fullBillShare, t("The full bill option is not available for this bill.", "Tum hesabi odeme secenegi bu hesap icin kullanilamaz."));
  }

  function handleSelectGuest(candidate: GuestPaymentEntryGuestCandidate, options?: { continueToPayment?: boolean }) {
    if (!state?.session) {
      return;
    }

    setMessage(t(`${candidate.displayName} selected. Loading your share.`, `${candidate.displayName} secildi. Payiniz yukleniyor.`));
    setError("");
    setJoinName("");
    setShowAddGuestForm(false);
    setSelectedTipRate(0);

    setPendingGuestNavigation({
      guestId: candidate.id,
      step: options?.continueToPayment ? "payment" : "split"
    });

    persistIdentity({
      guestId: candidate.id,
      guestName: candidate.displayName,
      sessionId: state.session.id
    });
  }

  function handleResetGuest() {
    persistIdentity(null);
    setJoinName("");
    setShowAddGuestForm(false);
    setMessage(t("Select or enter the correct guest name to continue.", "Devam etmek icin dogru misafir adini secin veya girin."));
  }

  function handleAddGuestClick() {
    setShowAddGuestForm(true);
    setJoinName("");
    setMessage("");
    setError("");
  }

  function handleCancelAddGuest() {
    setShowAddGuestForm(false);
    setJoinName("");
    setError("");
  }

  function handleNextGuestPayment() {
    if (!nextPayableGuestCandidate) {
      setMessage(t("No unpaid guest share is ready yet.", "Henuz hazir bekleyen odenmemis bir misafir payi yok."));
      return;
    }

    handleSelectGuest(nextPayableGuestCandidate, { continueToPayment: true });
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!state?.session) {
      return;
    }

    const requestedName = normalizeGuestName(joinName);

    if (!requestedName) {
      setError(t("Enter your name to connect this phone to the bill.", "Bu telefonu hesaba baglamak icin adinizi girin."));
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
        setShowAddGuestForm(false);
        setSelectedTipRate(0);
        setPendingGuestNavigation({
          guestId: reusableGuest.id,
          step: "split"
        });
        setMessage(t(`Continuing as ${reusableGuest.displayName}.`, `${reusableGuest.displayName} olarak devam ediliyor.`));
        return;
      }

      const result = await joinTableSession(tableCode, requestedName);
      persistIdentity({
        guestId: result.guest.id,
        guestName: result.guest.displayName,
        sessionId: result.session.id
      });
      setJoinName("");
      setShowAddGuestForm(false);
      setSelectedTipRate(0);
      setPendingGuestNavigation({
        guestId: result.guest.id,
        step: "split"
      });
      setMessage(
        result.created
          ? t(`Joined as ${result.guest.displayName}.`, `${result.guest.displayName} olarak katilindi.`)
          : t(`Continuing as ${result.guest.displayName}.`, `${result.guest.displayName} olarak devam ediliyor.`)
      );
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : t("Failed to join this bill.", "Bu hesaba katilinamadi."));
    } finally {
      setJoining(false);
    }
  }

  function renderGuestSelector(options?: { excludeGuestId?: string; continueToPayment?: boolean }) {
    const visibleCandidates = mapping.candidates.filter((candidate) => candidate.id !== options?.excludeGuestId);

    if (visibleCandidates.length === 0) {
      return null;
    }

    return (
      <div className="guest-checkout-candidates">
        {visibleCandidates.map((candidate) => {
          const isPaidCandidate = isPaidStatus(candidate.shareStatus);
          const candidateRoleLabel = getGuestRoleLabel(candidate.id);
          const candidateShareMeta = candidate.hasPaymentShare
            ? `${candidateRoleLabel} | ${candidate.shareAmount ? formatTryCurrency(candidate.shareAmount) : "-"} | ${candidate.shareStatus ? formatPaymentStatusValue(candidate.shareStatus) : t("Ready", "Hazir")}`
            : paymentSession
              ? `${candidateRoleLabel} | ${t("No active share found", "Aktif pay bulunamadi")}`
              : `${candidateRoleLabel} | ${t("Share is being prepared", "Pay hazirlaniyor")}`;

          return (
            <button
              key={candidate.id}
              type="button"
              className={`guest-checkout-candidate${isPaidCandidate ? " is-paid" : ""}`}
              disabled={isPaidCandidate}
              onClick={() => handleSelectGuest(candidate, { continueToPayment: options?.continueToPayment })}
            >
              <span>{candidate.displayName}</span>
              <small>{candidateShareMeta}</small>
            </button>
          );
        })}
      </div>
    );
  }

  function renderJoinedGuestsList(options?: { excludeGuestId?: string; continueToPayment?: boolean }) {
    const visibleGuestCount = mapping.candidates.filter((candidate) => candidate.id !== options?.excludeGuestId).length;

    if (visibleGuestCount === 0) {
      return null;
    }

    return (
      <div className="guest-checkout-joined-guests">
        <div className="guest-checkout-joined-guests-head">
          <span>{t("Guests", "Misafirler")}</span>
          <small>{t(`${state?.session?.guests.length ?? mapping.candidates.length} joined`, `${state?.session?.guests.length ?? mapping.candidates.length} kisi katildi`)}</small>
        </div>
        {renderGuestSelector(options)}
      </div>
    );
  }

  function renderIdentityCard() {
    if (!state?.session) {
      return null;
    }

    if (state.identifiedGuest) {
      const currentSharePaid = myShare?.status === "PAID" && !isCheckoutClosed;

      return (
        <div className="guest-checkout-identity-stack">
          {showAddGuestForm ? (
            <div className="guest-checkout-inline-join is-standalone">
              <form className="guest-checkout-join-form" onSubmit={handleJoin}>
                <input
                  type="text"
                  value={joinName}
                  onChange={(event) => setJoinName(event.target.value)}
                  placeholder={t("Guest name", "Misafir adi")}
                  autoComplete="name"
                />
                <button type="submit" disabled={joining || !state.session}>
                  {joining ? t("Adding...", "Ekleniyor...") : t("Add", "Ekle")}
                </button>
              </form>
              <button type="button" className="guest-checkout-text-btn" onClick={handleCancelAddGuest}>
                {t("Cancel", "Iptal")}
              </button>
            </div>
          ) : (
            <div className="guest-checkout-add-guest-row">
              <button type="button" className="guest-checkout-text-btn" onClick={handleAddGuestClick}>
                {t("Add guest", "Misafir ekle")}
              </button>
            </div>
          )}
          <div className="guest-checkout-identity">
            <div className="guest-checkout-person">
              <span className="guest-checkout-avatar">{getGuestInitials(state.identifiedGuest.displayName)}</span>
              <span>
                <small>{t("Paying as", "Odeyen")}</small>
                <strong className="guest-checkout-name-line">
                  <span>{state.identifiedGuest.displayName}</span>
                  <span className={getGuestRoleClassName(state.identifiedGuest.id)}>{getGuestRoleLabel(state.identifiedGuest.id)}</span>
                </strong>
              </span>
            </div>
            <div className="guest-checkout-identity-meta">
              {myShare ? (
                <span className={`guest-checkout-pill ${paymentShareStatusBadgeClass(myShare.status)}`}>
                  {formatTryCurrency(myShare.amount)} | {formatPaymentStatusValue(myShare.status)}
                </span>
              ) : (
                <span className="guest-checkout-pill is-muted">{t("No share yet", "Henuz pay yok")}</span>
              )}
              {mapping.matchSource ? <small>{t("Matched by", "Eslesen")} {formatMatchSource(mapping.matchSource)}</small> : null}
            </div>
            <div className="guest-checkout-identity-actions">
              <button type="button" className="guest-checkout-text-btn" onClick={handleResetGuest}>
                {t("Change", "Degistir")}
              </button>
            </div>
            {currentSharePaid ? (
              <div className="guest-checkout-handoff">
                <div>
                  <strong>{t(`${state.identifiedGuest.displayName} paid.`, `${state.identifiedGuest.displayName} odedi.`)}</strong>
                  <small>
                    {nextPayableGuestCandidate
                      ? t(`Next payable share: ${nextPayableGuestCandidate.displayName}`, `Siradaki odenebilir pay: ${nextPayableGuestCandidate.displayName}`)
                      : t("No other unpaid share is ready yet.", "Hazir baska bir odenmemis pay yok.")}
                  </small>
                </div>
                {nextPayableGuestCandidate ? (
                  <button type="button" onClick={handleNextGuestPayment}>
                    {t("Pay next", "Sonrakini ode")}
                  </button>
                ) : null}
              </div>
            ) : null}
            {renderJoinedGuestsList({ excludeGuestId: state.identifiedGuest.id })}
          </div>
        </div>
      );
    }

    return (
      <div className="guest-checkout-join-card">
        <div>
          <h3>{t("Connect this phone", "Bu telefonu bagla")}</h3>
          <p>{mapping.message ?? t("Enter the guest name that should pay from this phone.", "Bu telefondan odeyecek misafir adini girin.")}</p>
        </div>
        <form className="guest-checkout-join-form" onSubmit={handleJoin}>
          <input
            type="text"
            value={joinName}
            onChange={(event) => setJoinName(event.target.value)}
            placeholder={t("Your name", "Adiniz")}
            autoComplete="name"
          />
          <button type="submit" disabled={joining || !state.session}>
            {joining ? t("Connecting...", "Baglaniyor...") : t("Connect", "Bagla")}
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
          <span>{t("Live bill", "Canli hesap")}</span>
          <h1>{state ? t(`Table ${state.table.name}`, `Masa ${state.table.name}`) : t("Table bill", "Masa hesabi")}</h1>
          <p>{state ? t(`Table ${state.table.name}`, `Masa ${state.table.name}`) : t("Table bill", "Masa hesabi")}</p>
        </div>

        {renderIdentityCard()}

        <div className="guest-checkout-person-list">
          {billGroups.map((group, index) => {
            const isYou = group.guestId === identifiedGuestId;
            const visibleLines = showBreakdown ? group.lines : group.lines.slice(0, 2);
            const shareForGroup =
              paymentSession?.shares.find((share) => (group.guestId ? share.guestId === group.guestId : share.payerLabel === group.name)) ?? null;
            const isPaidGroup = isPaidStatus(shareForGroup?.status);

            return (
              <article key={group.key} className={`guest-person-bill${isYou ? " is-you" : ""}${isPaidGroup ? " is-paid" : ""}`}>
                <div className="guest-person-bill-head">
                  <span className="guest-person-bill-avatar">{getGuestInitials(group.name)}</span>
                  <div>
                    <h3>{isYou ? t("You", "Siz") : group.name}</h3>
                    <p>{group.itemCount > 0 ? t(`${group.itemCount} ordered item${group.itemCount === 1 ? "" : "s"}`, `${group.itemCount} urun siparis edildi`) : t("Prepared share", "Hazirlanan pay")}</p>
                  </div>
                  <div className="guest-checkout-identity-meta">
                    {shareForGroup ? (
                      <span className={`guest-checkout-pill ${paymentShareStatusBadgeClass(shareForGroup.status)}`}>
                        {formatPaymentStatusValue(shareForGroup.status)}
                      </span>
                    ) : null}
                    <strong>{formatCents(group.subtotalCents)}</strong>
                  </div>
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
                  {group.lines.length === 0 ? <p>{t("Payment share prepared by the restaurant.", "Odeme payi restoran tarafindan hazirlandi.")}</p> : null}
                  {!showBreakdown && group.lines.length > 2 ? <p>{t(`${group.lines.length - 2} more item(s)`, `${group.lines.length - 2} urun daha`)}</p> : null}
                </div>
              </article>
            );
          })}
          {billGroups.length === 0 ? <p className="guest-checkout-empty">{t("No bill lines found for this table yet.", "Bu masa icin henuz hesap satiri bulunamadi.")}</p> : null}
        </div>

        {billGroups.some((group) => group.lines.length > 2) ? (
          <button type="button" className="guest-checkout-secondary-action" onClick={() => setShowBreakdown((current) => !current)}>
            {showBreakdown ? t("Show compact bill", "Kisa hesabi goster") : t("Show all items", "Tum urunleri goster")}
          </button>
        ) : null}

        <div className="guest-checkout-total-card">
          <div>
            <span>{t("Subtotal", "Ara toplam")}</span>
            <strong>{formatCents(billLineSubtotalCents)}</strong>
          </div>
          <div>
            <span>{t("Service", "Servis")}</span>
            <strong>{formatCents(billServiceCents)}</strong>
          </div>
          <div className="is-total">
            <span>{t("Total", "Toplam")}</span>
            <strong>{formatCents(billTotalCents)}</strong>
          </div>
          {paymentSession ? (
            <div>
              <span>{t("Remaining amount", "Kalan tutar")}</span>
              <strong>{formatTryCurrency(paymentSession.remainingAmount)}</strong>
            </div>
          ) : null}
        </div>

        <button type="button" className="guest-checkout-primary-action" onClick={() => handleContinue("split")} disabled={!paymentSession}>
          {t("Split the bill", "Hesabi bol")}
        </button>
      </section>
    );
  }

  function renderSplitStep() {
    const activeSplit = splitChoices.find((choice) => choice.id === selectedSplitChoice) ?? splitChoices[0];

    return (
      <section className="guest-checkout-screen">
        <div className="guest-checkout-title">
          <span>{t("Split the bill", "Hesabi bol")}</span>
          <h1>{t("Choose split", "Bolme yontemi secin")}</h1>
          <p>{activeSplit.helper}</p>
        </div>

        <div className="guest-split-tabs" role="tablist" aria-label={t("Split method", "Bolme yontemi")}>
          {splitChoices.map((choice) => (
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
            <span>{t("Number of people", "Kisi sayisi")}</span>
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

        {!hasPayablePaymentShare ? renderIdentityCard() : null}

        <div className="guest-split-list">
          <p className="guest-checkout-label">{t("Each person pays", "Kisi basi odeme")}</p>
          {splitPreviewRows.map((row, index) => (
            <article
              key={`${row.id}-${index}`}
              className={`guest-split-row${row.isYou ? " is-you" : ""}${isPaidStatus(row.shareStatus) ? " is-paid" : ""}`}
            >
              <div>
                <span className="guest-split-avatar">{getGuestInitials(row.isYou ? t("You", "Siz") : row.label)}</span>
                <span>
                  <strong>{row.isYou ? t("You", "Siz") : row.label}</strong>
                  <small>{row.helper}</small>
                </span>
              </div>
              <div className="guest-checkout-identity-meta">
                {row.shareStatus ? (
                  <span className={`guest-checkout-pill ${paymentShareStatusBadgeClass(row.shareStatus)}`}>
                    {formatPaymentStatusValue(row.shareStatus)}
                  </span>
                ) : null}
                <strong>{formatCents(row.amountCents)}</strong>
              </div>
            </article>
          ))}
        </div>

        <div className="guest-checkout-total-card is-slim">
          <div className="is-total">
            <span>{t("Total", "Toplam")}</span>
            <strong>{formatCents(billTotalCents)}</strong>
          </div>
        </div>

        <div className="guest-step-actions">
          <button type="button" className="guest-checkout-secondary-action" onClick={() => setCheckoutStep("bill")}>
            {t("Back", "Geri")}
          </button>
          <button
            type="button"
            className="guest-checkout-primary-action"
            onClick={() => handleContinue("tip")}
            disabled={!hasPayablePaymentShare}
          >
            {t("Continue to tip", "Bahsise devam et")}
          </button>
        </div>
      </section>
    );
  }

  function renderTipStep() {
    return (
      <section className="guest-checkout-screen">
        <div className="guest-checkout-title">
          <span>{t("Add a tip", "Bahsis ekle")}</span>
          <h1>{t("Tip your waiter", "Garsona bahsis verin")}</h1>
          <p>{paymentShare ? t(`Based on ${formatTryCurrency(paymentShare.amount)}`, `${formatTryCurrency(paymentShare.amount)} uzerinden`) : t("Choose a tip after your share is ready.", "Payiniz hazir olduktan sonra bahsis secin.")}</p>
        </div>

        {!hasPayablePaymentShare ? renderIdentityCard() : null}

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
                disabled={!hasPayablePaymentShare}
              >
                <span>{formatTipPresetLabelValue(rate)}</span>
                <strong>{rate === 0 ? t("No extra charge", "Ek ucret yok") : formatTryCurrency(tipAmount)}</strong>
              </button>
            );
          })}
        </div>

        <div className="guest-checkout-total-card">
          <div>
            <span>{t("Your share", "Sizin payiniz")}</span>
            <strong>{formatCents(paymentBaseCents)}</strong>
          </div>
          <div>
            <span>{t("Tip", "Bahsis")}</span>
            <strong>{formatCents(selectedTipCents)}</strong>
          </div>
          <div className="is-total">
            <span>{t("Total with tip", "Bahsis dahil toplam")}</span>
            <strong>{formatCents(paymentTotalCents)}</strong>
          </div>
        </div>

        <div className="guest-step-actions">
          <button type="button" className="guest-checkout-secondary-action" onClick={() => setCheckoutStep("split")}>
            {t("Back", "Geri")}
          </button>
          <button
            type="button"
            className="guest-checkout-primary-action"
            onClick={() => handleContinue("payment")}
            disabled={!hasPayablePaymentShare}
          >
            {t("Continue to payment", "Odemeye devam et")}
          </button>
        </div>
      </section>
    );
  }

  function renderPaymentStep() {
    const paymentDisabled = !canOpenPaymentShare(paymentShare) || isCheckoutClosed || Boolean(payingShareId);
    const paymentDisabledReason = !paymentShare
      ? t("Connect this phone to a guest before payment.", "Odemeden once bu telefonu bir misafire baglayin.")
      : isCheckoutClosed
        ? t("This bill is already closed.", "Bu hesap zaten kapandi.")
        : !canOpenPaymentShare(paymentShare)
          ? mapping.payMyShareDisabledReason ?? t("This share is not ready for online payment.", "Bu pay online odeme icin henuz hazir degil.")
          : "";

    return (
      <section className="guest-checkout-screen">
        <div className="guest-checkout-title">
          <span>{t("Payment", "Odeme")}</span>
          <h1>{formatCents(paymentTotalCents)}</h1>
          <p>{paymentShare ? paymentShare.payerLabel : t("Connect your name before payment.", "Odemeden once adinizi baglayin.")}</p>
        </div>

        <div className="guest-payment-summary">
          <div>
            <span>{t("Base share", "Ana pay")}</span>
            <strong>{formatCents(paymentBaseCents)}</strong>
          </div>
          <div>
            <span>{t("Tip", "Bahsis")}</span>
            <strong>{formatCents(selectedTipCents)}</strong>
          </div>
          <div>
            <span>{t("Status", "Durum")}</span>
            <strong>{paymentShare ? formatPaymentStatusValue(paymentShare.status) : t("Not ready", "Hazir degil")}</strong>
          </div>
        </div>

        {myShareDiffersFromItems ? (
          <p className="guest-checkout-note">{t("Your payable share differs from your item subtotal because the prepared split is not by items.", "Hazirlanan bolme urunlere gore olmadigi icin odeyeceginiz pay urun ara toplaminizdan farklidir.")}</p>
        ) : null}

        <div className="guest-iyzico-handoff">
          <div className="guest-iyzico-brand">
            <span>iy</span>
            <div>
              <strong>{t("iyzico secure payment", "iyzico guvenli odeme")}</strong>
              <small>{t("You will leave this page for the card screen, then return automatically.", "Kart ekrani icin bu sayfadan ayrilacak, sonra otomatik doneceksiniz.")}</small>
            </div>
          </div>
          <div className="guest-iyzico-steps">
            <span className="is-done">{t("Share ready", "Pay hazir")}</span>
            <span className={paymentShare ? "is-active" : ""}>{t("Redirect", "Yonlendirme")}</span>
            <span>{t("Result sync", "Sonuc senkronu")}</span>
          </div>
        </div>

        <div className="guest-payment-methods">
          {paymentMethods.map((method) => (
            <button
              key={method.id}
              type="button"
              className={selectedPaymentMethod === method.id ? "is-active" : ""}
              onClick={() => handlePaymentMethod(method.id)}
              disabled={paymentDisabled}
            >
              <span>{selectedPaymentMethod === method.id ? paymentMethodLabelValue(paymentShare, payingShareId) : method.label}</span>
              <small>{method.helper}</small>
            </button>
          ))}
        </div>

        <button type="button" className="guest-checkout-primary-action" onClick={handleContinueToIyzico} disabled={paymentDisabled}>
          {payingShareId === paymentShare?.id
            ? t("Opening iyzico...", "iyzico aciliyor...")
            : hasPendingPaymentLink(paymentShare)
              ? t("Continue iyzico payment", "iyzico odemesine devam et")
              : t("Pay with iyzico", "iyzico ile ode")}
        </button>
        {paymentDisabledReason ? <p className="guest-checkout-note is-warning">{paymentDisabledReason}</p> : null}

        {fullBillShare && fullBillShare.id !== paymentShare?.id ? (
          <button
            type="button"
            className="guest-checkout-secondary-action"
            onClick={handlePayFullBill}
            disabled={!canOpenPaymentShare(fullBillShare) || isCheckoutClosed || Boolean(payingShareId)}
          >
            {payingShareId === fullBillShare.id
              ? t("Payment processing", "Odeme isleniyor")
              : hasPendingPaymentLink(fullBillShare)
                ? t("Continue full bill payment", "Tum hesap odemesine devam et")
                : t("Pay full bill", "Tum hesabi ode")}
          </button>
        ) : null}

      </section>
    );
  }

  function renderSuccessScreen() {
    if (!paymentSession) {
      return null;
    }

    return (
      <section className="guest-checkout-screen">
        <div className="guest-checkout-title">
          <span>{t("Payment successful", "Odeme basarili")}</span>
          <h1>{state?.session?.closedAt ? t("Bill closed", "Hesap kapandi") : t("Payment received", "Odeme alindi")}</h1>
          <p>{state?.session?.closedAt ? t(`Closed ${formatDateTimeValue(state.session.closedAt)}`, `Kapandi ${formatDateTimeValue(state.session.closedAt)}`) : t("Payment shares were updated.", "Odeme paylari guncellendi.")}</p>
        </div>

        <div className="guest-checkout-total-card">
          <div>
            <span>{t("Total", "Toplam")}</span>
            <strong>{formatTryCurrency(paymentSession.totalAmount)}</strong>
          </div>
          <div>
            <span>{t("Paid", "Odendi")}</span>
            <strong>{formatTryCurrency(paymentSession.paidAmount)}</strong>
          </div>
          <div className="is-total">
            <span>{t("Remaining amount", "Kalan tutar")}</span>
            <strong>{formatTryCurrency(paymentSession.remainingAmount)}</strong>
          </div>
        </div>

        <div className="guest-split-list">
          <p className="guest-checkout-label">{t("Payment shares", "Odeme paylari")}</p>
          {paymentSession.shares.map((share) => (
            <article
              key={share.id}
              className={`guest-split-row${share.guestId === identifiedGuestId ? " is-you" : ""}${isPaidStatus(share.status) ? " is-paid" : ""}`}
            >
              <div>
                <span className="guest-split-avatar">{getGuestInitials(share.guestId === identifiedGuestId ? t("You", "Siz") : share.payerLabel)}</span>
                <span>
                  <strong>{share.guestId === identifiedGuestId ? t("You", "Siz") : share.payerLabel}</strong>
                  <small>{share.paidAt ? t(`Paid ${formatDateTimeValue(share.paidAt)}`, `Odendi ${formatDateTimeValue(share.paidAt)}`) : formatPaymentStatusValue(share.status)}</small>
                </span>
              </div>
              <span className={`guest-checkout-pill ${paymentShareStatusBadgeClass(share.status)}`}>
                {formatPaymentStatusValue(share.status)}
              </span>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="guest-checkout-app">
      <section className="guest-checkout-phone">
        <header className="guest-checkout-header">
          <div>
            <strong>{state ? t(`Table ${state.table.name}`, `Masa ${state.table.name}`) : t("Split payment", "Bolunmus odeme")}</strong>
            {state?.session && paymentSession ? (
              <small>
                {formatSplitModeLabelValue(paymentSession.splitMode)} | {t("Opened", "Acildi")} {formatDateTimeValue(state.session.openedAt)}
              </small>
            ) : null}
          </div>
          <div className="guest-checkout-header-actions">
            {paymentSession ? (
              <>
                <span className="guest-checkout-pill is-muted">{t("Remaining amount", "Kalan tutar")} {formatTryCurrency(paymentSession.remainingAmount)}</span>
                <span className={`guest-checkout-pill ${paymentSessionStatusBadgeClass(paymentSession.status)}`}>
                  {formatPaymentStatusValue(paymentSession.status)}
                </span>
              </>
            ) : null}
          </div>
        </header>

        <nav className="guest-checkout-progress" aria-label={t("Checkout steps", "Odeme adimlari")}>
          {checkoutSteps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              className={`${checkoutStep === step.id ? "is-active" : ""}${currentStepIndex > index ? " is-complete" : ""}`}
              onClick={() => (paymentSession && !isCheckoutClosed ? setCheckoutStep(step.id) : undefined)}
              disabled={!paymentSession || isCheckoutClosed}
            >
              <span>{index + 1}</span>
              <small>{step.label}</small>
            </button>
          ))}
        </nav>

        <div className="guest-checkout-status-stack">
          {loading ? <p className="guest-checkout-status is-neutral">{t("Loading payment details.", "Odeme detaylari yukleniyor.")}</p> : null}
          {error ? <p className="guest-checkout-status is-error">{error}</p> : null}
          {message ? <p className="guest-checkout-status is-neutral">{message}</p> : null}
        </div>

        {state?.session && paymentSession ? (
          isCheckoutClosed ? (
            renderSuccessScreen()
          ) : (
            <>
              {checkoutStep === "bill" ? renderBillStep() : null}
              {checkoutStep === "split" ? renderSplitStep() : null}
              {checkoutStep === "tip" ? renderTipStep() : null}
              {checkoutStep === "payment" ? renderPaymentStep() : null}
            </>
          )
        ) : (
          <section className="guest-checkout-screen">
            <div className="guest-checkout-title">
              <span>{t("Bill", "Hesap")}</span>
              <h1>{state?.session ? t("Bill is being prepared", "Hesap hazirlaniyor") : t("No live bill yet", "Henuz canli hesap yok")}</h1>
              <p>
                {state?.session
                  ? t("As soon as the restaurant sends the check from the POS, split options and payment will appear here.", "Restoran hesabi POS'tan gonderdigi anda bolme secenekleri ve odeme burada gorunecek.")
                  : t("Ask staff to open the table and send the bill from the POS.", "Personelden masayi acmasini ve hesabi POS'tan gondermesini isteyin.")}
              </p>
            </div>
            {renderIdentityCard()}
          </section>
        )}
      </section>

    </div>
  );
}
