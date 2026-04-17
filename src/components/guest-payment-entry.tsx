"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { clearGuestIdentity, readGuestIdentity, writeGuestIdentity } from "@/lib/guest-identity";

type SplitMode = "FULL_BY_ONE" | "EQUAL" | "BY_GUEST_ITEMS";
type PaymentSessionStatus = "OPEN" | "PARTIALLY_PAID" | "PAID" | "FAILED" | "EXPIRED";
type PaymentShareStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED" | "CANCELLED";

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

function formatSplitModeLabel(mode: SplitMode): string {
  if (mode === "FULL_BY_ONE") {
    return "Tek kisi tum hesap";
  }

  if (mode === "BY_GUEST_ITEMS") {
    return "Kisiye gore urun";
  }

  return "Esit bolusum";
}

function formatPaymentStatus(value: string): string {
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

  if (status === "FAILED" || status === "EXPIRED") {
    return "badge-danger";
  }

  return "badge-status-open";
}

async function fetchGuestPaymentEntry(tableCode: string, guestId: string): Promise<GuestPaymentEntryState> {
  const query = guestId ? `?guestId=${encodeURIComponent(guestId)}` : "";
  const response = await fetch(`/api/guest/${encodeURIComponent(tableCode)}/payment${query}`, { cache: "no-store" });
  const json = (await response.json()) as GuestPaymentEntryResponse;

  if (!response.ok || !json.data) {
    throw new Error(json.error || "Odeme bilgisi yuklenemedi.");
  }

  return json.data;
}

export function GuestPaymentEntry({ tableCode, initialGuestId = "", backHref }: Props) {
  const [state, setState] = useState<GuestPaymentEntryState | null>(null);
  const [guestId, setGuestId] = useState(initialGuestId.trim());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(false);

  useEffect(() => {
    if (guestId) {
      return;
    }

    const storedGuestId = readGuestIdentity(tableCode);

    if (storedGuestId) {
      setGuestId(storedGuestId);
    }
  }, [guestId, tableCode]);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const payload = await fetchGuestPaymentEntry(tableCode, guestId);
      setState(payload);

      if (payload.identifiedGuest) {
        writeGuestIdentity(tableCode, payload.identifiedGuest.id);
        if (guestId !== payload.identifiedGuest.id) {
          setGuestId(payload.identifiedGuest.id);
        }
      } else if (guestId) {
        clearGuestIdentity(tableCode);
        setGuestId("");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Odeme bilgisi yuklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableCode, guestId]);

  const paymentSession = state?.paymentSession ?? null;
  const myShare = paymentSession?.myShare ?? null;
  const fullBillShare = paymentSession?.fullBillShare ?? null;
  const joinedGuestNames = useMemo(
    () => state?.session?.guests.map((guest) => guest.displayName).filter(Boolean) ?? [],
    [state?.session?.guests]
  );

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
    routeToHostedPayment(
      myShare,
      state?.identifiedGuest
        ? "Adinizla eslesen odeme payi bulunamadi. Kasaya adinizi iletip payinizi dogrulatin."
        : "Kisi kaydiniz bulunmuyor. Once masaya adinizla katilin."
    );
  }

  function handlePayAll() {
    routeToHostedPayment(fullBillShare, "Tum hesap odeme secenegi bu adisyonda aktif degil.");
  }

  function handleViewBreakdown() {
    setMessage("");
    setShowBreakdown((current) => !current);
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

          {paymentSession ? (
            <>
              <div className="detail-grid">
                <div className="detail-card">
                  <span className="detail-label">Bolusum tipi</span>
                  <span className="detail-value">{formatSplitModeLabel(paymentSession.splitMode)}</span>
                </div>
                <div className="detail-card">
                  <span className="detail-label">Sizin payiniz</span>
                  <span className="detail-value">{myShare ? formatCurrency(myShare.amount) : "Eslestirilemedi"}</span>
                </div>
                <div className="detail-card">
                  <span className="detail-label">Toplam adisyon</span>
                  <span className="detail-value">{formatCurrency(paymentSession.totalAmount)}</span>
                </div>
                <div className="detail-card">
                  <span className="detail-label">Kalan tutar</span>
                  <span className="detail-value">{formatCurrency(paymentSession.remainingAmount)}</span>
                </div>
                <div className="detail-card">
                  <span className="detail-label">Tum hesap secenegi</span>
                  <span className="detail-value">{paymentSession.fullBillOptionEnabled ? "Aktif" : "Kapali"}</span>
                </div>
              </div>

              {state.identifiedGuest ? (
                <p className="helper-text">
                  Siz: <strong>{state.identifiedGuest.displayName}</strong>
                </p>
              ) : (
                <p className="helper-text">
                  Kisi kaydi bulunamadi. Masaya adinizla katildiysaniz ekran otomatik olarak payinizi esler.
                </p>
              )}

              {myShare ? (
                <div className="badge-row">
                  <span className={`badge ${paymentShareStatusBadgeClass(myShare.status)}`}>
                    Pay durumu: {formatPaymentStatus(myShare.status)}
                  </span>
                  <span className="badge badge-outline">{myShare.payerLabel}</span>
                </div>
              ) : null}

              <div className="ticket-actions">
                <button type="button" className="ticket-action-btn" onClick={handlePayMyShare}>
                  Pay my share
                </button>
                <button
                  type="button"
                  className="ticket-action-btn"
                  onClick={handlePayAll}
                  disabled={!fullBillShare || fullBillShare.status === "PAID"}
                >
                  Pay all
                </button>
                <button type="button" className="ticket-action-btn secondary" onClick={handleViewBreakdown}>
                  View bill breakdown
                </button>
              </div>
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
                  <span className="badge badge-outline">{formatCurrency(share.amount)}</span>
                </div>
                <div className="badge-row">
                  <span className={`badge ${paymentShareStatusBadgeClass(share.status)}`}>{formatPaymentStatus(share.status)}</span>
                  {share.guestId ? <span className="badge badge-neutral">Guest mapped</span> : null}
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
                  <span className="badge badge-outline">{formatCurrency(line.amount)}</span>
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
    </div>
  );
}
