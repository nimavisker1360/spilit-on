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
  return new Date(value).toLocaleString("tr-TR");
}

function formatSplitModeLabel(mode: SplitMode): string {
  if (mode === "FULL_BY_ONE") {
    return "Tum hesap";
  }

  if (mode === "BY_GUEST_ITEMS") {
    return "Kisi bazli siparis";
  }

  return "Esit bolusum";
}

function formatPaymentStatus(value: string): string {
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

function formatMatchSource(value: GuestPaymentEntryMatchSource): string {
  if (value === "EXACT_GUEST_ID") {
    return "id";
  }

  if (value === "NORMALIZED_NAME") {
    return "ad";
  }

  if (value === "CASE_INSENSITIVE_NORMALIZED_NAME") {
    return "ad (buyuk-kucuk harf duyarli degil)";
  }

  if (value === "ALIAS") {
    return "takma ad";
  }

  return "belirlenemedi";
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
    throw new Error(json.error || "Odeme bilgisi yuklenemedi.");
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
      setError(loadError instanceof Error ? loadError.message : "Odeme bilgisi yuklenemedi.");
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
      setMessage("Bu odeme zaten tamamlanmis gorunuyor.");
      return;
    }

    if (!share.paymentUrl) {
      setMessage("Online odeme baglantisi henuz hazir degil. Kasadan odeme linki isteyin.");
      return;
    }

    window.location.assign(share.paymentUrl);
  }

  function handlePayMyShare() {
    routeToHostedPayment(myShare, mapping.payMyShareDisabledReason ?? "Adiniza ait odeme payi henuz hazir degil.");
  }

  function handlePayAll() {
    routeToHostedPayment(fullBillShare, "Tum hesap odeme secenegi bu adisyonda aktif degil.");
  }

  function handleViewBreakdown() {
    setMessage("");
    setShowBreakdown((current) => !current);
  }

  function handleSelectGuest(candidate: GuestPaymentEntryGuestCandidate) {
    if (!state?.session) {
      return;
    }

    setMessage(`${candidate.displayName} secildi. Payiniz yukleniyor.`);
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
      return <p className="helper-text">Masaya katilan kisi bulunamadigi icin secim yapilamiyor.</p>;
    }

    return (
      <div className="stack-md">
        <div className="section-copy">
          <h4>Adinizi secin</h4>
          <p className="helper-text">Kendi payinizi gormek ve odemek icin listeden adinizi secin.</p>
        </div>

        <div className="guest-selector-list">
          {mapping.candidates.map((candidate) => {
            const candidateShareMeta = candidate.hasPaymentShare
              ? `${candidate.shareAmount ? formatTryCurrency(candidate.shareAmount) : "-"} | ${candidate.shareStatus ? formatPaymentStatus(candidate.shareStatus) : "Hazir"}`
              : paymentSession
                ? "Bu kisi icin aktif pay bulunamadi"
                : "Pay hazirlaniyor";

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
            <p className="section-kicker">QR odeme girisi</p>
            <h2>{state ? `Masa ${state.table.name}` : "Masa odemesi"}</h2>
            <p className="panel-subtitle">Kart bilgisi bu adimda alinmaz. Bir sonraki adimda guvenli odeme sayfasina gecis yapilir.</p>
          </div>
          <div className="inline">
            <Link href={backHref} className="guest-footer-link">
              Siparis ekranina don
            </Link>
            <button type="button" onClick={() => void load()}>
              Yenile
            </button>
          </div>
        </div>

        <div className="status-stack">
          {loading ? <p className="status-banner is-neutral">Odeme bilgileri yukleniyor.</p> : null}
          {error ? <p className="status-banner is-error">{error}</p> : null}
          {message ? <p className="status-banner is-neutral">{message}</p> : null}
        </div>
      </section>

      {state?.session ? (
        <section className="panel stack-md">
          <div className="section-head">
            <div className="section-copy">
              <h3>Masa oturumu</h3>
              <p className="helper-text">Masa: {state.table.name}</p>
              <p className="helper-text">Oturum acilis: {formatDateTime(state.session.openedAt)}</p>
            </div>
            {paymentSession ? (
              <span className={`badge ${paymentSessionStatusBadgeClass(paymentSession.status)}`}>
                {formatPaymentStatus(paymentSession.status)}
              </span>
            ) : (
              <span className="badge badge-status-open">Odeme bekleniyor</span>
            )}
          </div>

          <div className="selection-summary stack-md">
            <p className="dashboard-stat-label">Masaya katilan kisiler</p>
            {joinedGuestNames.length > 0 ? (
              <div className="guest-strip">
                {joinedGuestNames.map((name) => (
                  <span key={name} className="guest-chip">
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="helper-text">Henuz masaya katilan kisi yok.</p>
            )}
          </div>

          <div className="selection-summary stack-md">
            <div className="section-copy">
              <h3>Kisi eslestirmesi</h3>
              <p className="helper-text">{mapping.message ?? "Adiniz bu oturumla eslestirildiginde kendi payiniz burada gorunur."}</p>
            </div>

            {state.identifiedGuest ? (
              <div className="stack-md">
                <p>
                  Eslesen kisi: <strong>{state.identifiedGuest.displayName}</strong>
                </p>
                <div className="badge-row">
                  <span className="badge badge-neutral">Kisi eslesti</span>
                  {mapping.matchSource ? (
                    <span className="badge badge-outline">Eslestirme: {formatMatchSource(mapping.matchSource)}</span>
                  ) : null}
                  {myShare ? (
                    <span className={`badge ${paymentShareStatusBadgeClass(myShare.status)}`}>
                      Odeme durumu: {formatPaymentStatus(myShare.status)}
                    </span>
                  ) : (
                    <span className="badge badge-danger">Odeme payi bulunamadi</span>
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
                  <span className="detail-label">Bolusum tipi</span>
                  <span className="detail-value">{formatSplitModeLabel(paymentSession.splitMode)}</span>
                </div>
                <div className="detail-card">
                  <span className="detail-label">Sizin payiniz</span>
                  <span className="detail-value">{myShare ? formatTryCurrency(myShare.amount) : "Adinizi secin"}</span>
                </div>
                <div className="detail-card">
                  <span className="detail-label">Toplam adisyon</span>
                  <span className="detail-value">{formatTryCurrency(paymentSession.totalAmount)}</span>
                </div>
                <div className="detail-card">
                  <span className="detail-label">Kalan tutar</span>
                  <span className="detail-value">{formatTryCurrency(paymentSession.remainingAmount)}</span>
                </div>
                <div className="detail-card">
                  <span className="detail-label">Tum hesap</span>
                  <span className="detail-value">{paymentSession.fullBillOptionEnabled ? "Aktif" : "Kapali"}</span>
                </div>
              </div>

              {myShare ? (
                <div className="badge-row">
                  <span className={`badge ${paymentShareStatusBadgeClass(myShare.status)}`}>
                    Odeme durumu: {formatPaymentStatus(myShare.status)}
                  </span>
                  <span className="badge badge-outline">{myShare.payerLabel}</span>
                </div>
              ) : null}

              <div className="ticket-actions">
                <button type="button" className="ticket-action-btn" onClick={handlePayMyShare} disabled={!canPayMyShare}>
                  Kendi payimi ode
                </button>
                <button type="button" className="ticket-action-btn" onClick={handlePayAll} disabled={!canPayAll}>
                  Tum hesabi ode
                </button>
                <button type="button" className="ticket-action-btn secondary" onClick={handleViewBreakdown}>
                  Adisyonu incele
                </button>
              </div>

              {!canPayMyShare && mapping.payMyShareDisabledReason ? (
                <p className="helper-text">{mapping.payMyShareDisabledReason}</p>
              ) : null}
            </>
          ) : (
            <div className="selection-summary stack-md">
              <p>
                <strong>Odeme henuz baslamamis.</strong>
              </p>
              <p className="helper-text">Kasada hesap hazirlandiginda bu ekranda payiniz ve odeme secenekleri gorunecek.</p>
            </div>
          )}
        </section>
      ) : (
        <section className="panel">
          <p className="empty empty-state">Bu masada su an acik bir oturum yok. Personelden masayi acmasini isteyin.</p>
        </section>
      )}

      {showBreakdown && paymentSession ? (
        <section className="panel stack-md">
          <div className="section-copy">
            <h3>Adisyon dagilimi</h3>
            <p className="helper-text">Bu liste sadece bilgilendirme amaclidir. Kart bilgisi alinmaz.</p>
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
                  {share.guestId ? <span className="badge badge-neutral">Kisi eslesti</span> : null}
                </div>
              </article>
            ))}
          </div>

          <div className="section-copy">
            <h4>Kalemler</h4>
          </div>
          <div className="list">
            {paymentSession.invoiceLines.map((line) => (
              <article key={line.id} className="list-item entity-card stack-md">
                <div className="entity-top">
                  <p>
                    <strong>{line.label}</strong>
                  </p>
                  <span className="badge badge-outline">{formatTryCurrency(line.amount)}</span>
                </div>
                <p className="meta">{line.guestName ? `Kisi: ${line.guestName}` : "Paylasilan kalem"}</p>
              </article>
            ))}
            {paymentSession.invoiceLines.length === 0 ? (
              <p className="empty empty-state">Bu adisyon icin kalem detayi bulunamadi.</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {isDevelopment && state?.debug ? (
        <section className="panel stack-md">
          <div className="section-copy">
            <h3>Dev trace</h3>
            <p className="helper-text">Yalnizca gelistirme ortaminda gorunur.</p>
          </div>
          <pre className="debug-trail">{JSON.stringify(state.debug, null, 2)}</pre>
        </section>
      ) : null}
    </div>
  );
}
