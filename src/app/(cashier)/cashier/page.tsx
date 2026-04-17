"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { useRealtimeEvents } from "@/hooks/use-realtime-events";
import { formatTryCurrency } from "@/lib/currency";

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

const percentageFormatter = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

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
    return "Tum hesap";
  }

  if (mode === "BY_GUEST_ITEMS") {
    return "Kisi bazli siparis";
  }

  return "Esit bolusum";
}

function splitModeDescription(mode: InvoiceSplitMode): string {
  if (mode === "FULL_BY_ONE") {
    return "Toplam adisyon tek bir kisiye yazilir.";
  }

  if (mode === "BY_GUEST_ITEMS") {
    return "Her misafir sadece kendi siparis kalemlerini oder.";
  }

  return "Toplam adisyon masadaki kisiler arasinda esit bolunur.";
}

function splitModeHelper(mode: InvoiceSplitMode): string {
  if (mode === "FULL_BY_ONE") {
    return "Tum hesap tek kart veya tek nakit odemesi icin uygundur.";
  }

  if (mode === "BY_GUEST_ITEMS") {
    return "Kisilerin kendi siparisini odedigi restoran akisi icin uygundur.";
  }

  return "Arkadas gruplarinda esit bolusumla hizli cikis icin en pratik secenektir.";
}

function formatStatusLabel(value: string): string {
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
    return "Kasada nakit";
  }

  if (provider === "CARD_POS") {
    return "Kart POS";
  }

  if (provider === "MOCK_ONLINE_LINK") {
    return "Online odeme linki";
  }

  return formatStatusLabel(provider);
}

function formatPercentage(value: number): string {
  return `${percentageFormatter.format(value)}%`;
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
        throw new Error(json.error || "Odeme hazirlama basarisiz.");
      }

      setPaymentSession(json.data.paymentSession);
      setPaymentSessionNotice(
        json.data.created
          ? "Odeme paylari hazir. Her pay icin tahsilat baslatabilir ve bekleyen odemeleri tamamlayabilirsiniz."
          : "Bu adisyon icin mevcut odeme oturumu yuklendi."
      );
    } catch (prepareError) {
      setPaymentSessionError(prepareError instanceof Error ? prepareError.message : "Odeme hazirlama basarisiz.");
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
        throw new Error(json.error || "Odeme payi guncellenemedi.");
      }

      setPaymentSession(json.data.paymentSession);
      setPaymentSessionNotice(json.data.message);
      void loadData({ silent: true });
    } catch (actionError) {
      setPaymentSessionError(actionError instanceof Error ? actionError.message : "Odeme payi guncellenemedi.");
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
            <p className="dashboard-stat-label">Bolusum tipi</p>
            <p className="dashboard-stat-value">{splitModeLabel(form.splitMode)}</p>
            <p className="dashboard-stat-note">{splitModeDescription(form.splitMode)}</p>
          </article>
        </div>

        <div className="status-stack">
          {loading ? <p className="status-banner is-neutral">Acik hesaplar yukleniyor.</p> : null}
          {error ? <p className="status-banner is-error">{error}</p> : null}
        </div>
      </section>

      <form className="form-card stack-md" onSubmit={handleCalculate}>
        <div className="section-copy">
          <h3>Adisyonu hesapla</h3>
          <p className="helper-text">Odeme paylarini olusturmadan once adisyon ozetini hazirlayin.</p>
        </div>

        <label>
          Acik oturum
          <select
            value={form.sessionId}
            onChange={(event) => setForm((prev) => ({ ...prev, sessionId: event.target.value }))}
            required
          >
            <option value="">Oturum secin</option>
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
                <span className="badge badge-status-paid-payment">Kapatmaya hazir</span>
              ) : null}
            </div>
            <p className="helper-text">
              {formatSessionSummary(selectedSession)}
              {selectedSession.readyToCloseAt ? ` | Hazirlanma: ${formatDateTime(selectedSession.readyToCloseAt)}` : ""}
            </p>
          </div>
        ) : null}

        <label>
          Bolusum tipi
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
            <option value="FULL_BY_ONE">Tum hesap tek kisi</option>
            <option value="EQUAL">Esit bolusum</option>
            <option value="BY_GUEST_ITEMS">Kisi bazli siparis</option>
          </select>
        </label>

        <div className="helper-panel stack-md">
          <p className="helper-text">{splitModeDescription(form.splitMode)}</p>
          <p className="meta">{splitModeHelper(form.splitMode)}</p>
        </div>

        {form.splitMode === "FULL_BY_ONE" ? (
          <label>
            Odeyen kisi
            <select
              value={form.payerGuestId}
              onChange={(event) => setForm((prev) => ({ ...prev, payerGuestId: event.target.value }))}
              required
            >
              <option value="">Kisi secin</option>
              {selectedSession?.guests.map((guest) => (
                <option key={guest.id} value={guest.id}>
                  {guest.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <button type="submit" disabled={isCalculating || !form.sessionId}>
          {isCalculating ? "Hesaplaniyor..." : "Adisyonu hesapla"}
        </button>
        {invoiceError ? <p className="status-banner is-error">{invoiceError}</p> : null}
      </form>

      {invoice ? (
        <section className="panel stack-md invoice-result-panel">
          {isCalculating ? <p className="status-banner is-neutral">Adisyon ozeti guncelleniyor.</p> : null}

          <div className="section-head">
            <div className="section-copy">
              <p className="section-kicker">Adisyon</p>
              <h3>{formatInvoiceNumber(invoice.id, invoice.createdAt)}</h3>
              <p className="panel-subtitle">Odeme hazirligi sirasinda adisyon ozeti ekranda kalir.</p>
            </div>
            <span className="badge badge-outline">{splitModeLabel(invoice.splitMode)}</span>
          </div>

          <div className="invoice-total-card">
            <p className="dashboard-stat-label">Toplam adisyon</p>
            <p className="invoice-total-value">{formatTryCurrency(invoice.total)}</p>
            <p className="dashboard-stat-note">
              {invoice.splits.length} odeme payi, {invoice.lines.length} adisyon kalemi.
            </p>
          </div>

          <div className="detail-grid">
            <div className="detail-card">
              <span className="detail-label">Bolusum tipi</span>
              <span className="detail-value">{splitModeLabel(invoice.splitMode)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Kisi basi ortalama</span>
              <span className="detail-value">{formatTryCurrency(invoiceAverageShare)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Bolusturulen tutar</span>
              <span className="detail-value">{formatTryCurrency(invoiceSplitTotal)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Kalan tutar</span>
              <span className="detail-value">{formatTryCurrency(invoiceUnassignedAmount)}</span>
            </div>
            <div className="detail-card">
              <span className="detail-label">Hesaplanma zamani</span>
              <span className="detail-value">{formatDateTime(invoice.createdAt)}</span>
            </div>
          </div>

          <div className="prepare-payment-panel stack-md">
            <div className="section-copy">
              <h4>Odeme hazirla</h4>
              <p className="helper-text">
                Adisyon hesaplandiktan sonra odeme paylarini olusturun. Nakit, kart ve online link aksiyonlari TRY
                odeme akisi icin ayni ekran uzerinden yonetilir.
              </p>
            </div>

            <div className="ticket-actions">
              <button
                type="button"
                className="ticket-action-btn"
                onClick={handlePreparePayment}
                disabled={isPreparingPayment}
              >
                {isPreparingPayment ? "Hazirlaniyor..." : "Odeme paylarini olustur"}
              </button>
            </div>
          </div>

          {paymentSessionNotice ? <p className="status-banner is-success">{paymentSessionNotice}</p> : null}
          {paymentSessionError ? <p className="status-banner is-error">{paymentSessionError}</p> : null}

          {paymentSession ? (
            <div className="settlement-desk stack-md">
              <div className="section-head">
                <div className="section-copy">
                  <p className="section-kicker">Odeme takibi</p>
                  <h4>Odeme paylari</h4>
                  <p className="helper-text">Her pay icin tahsilati baslatin, bekleyenleri tamamlayin ve kalan tutari takip edin.</p>
                </div>
                <span className={`badge ${paymentSessionStatusBadgeClass(paymentSession.status)}`}>
                  {formatStatusLabel(paymentSession.status)}
                </span>
              </div>

              {paymentSession.session?.readyToCloseAt ? (
                <p className="status-banner is-success">
                  Masa {paymentSession.session.table?.name ?? selectedSession?.table.name ?? ""} kapatmaya hazir. Saat:{" "}
                  {formatDateTime(paymentSession.session.readyToCloseAt)}.
                </p>
              ) : null}

              {paymentSummary ? (
                <div className="grid-4 checkout-summary-grid">
                  <article className="dashboard-stat-card checkout-summary-card">
                    <p className="dashboard-stat-label">Toplam tutar</p>
                    <p className="dashboard-stat-value">{formatTryCurrency(paymentSummary.totalAmount)}</p>
                    <p className="dashboard-stat-note">Tahsil edilmesi gereken toplam TRY tutari.</p>
                  </article>
                  <article className="dashboard-stat-card checkout-summary-card">
                    <p className="dashboard-stat-label">Odenen tutar</p>
                    <p className="dashboard-stat-value">{formatTryCurrency(paymentSummary.paidAmount)}</p>
                    <p className="dashboard-stat-note">Tahsil edilen odeme paylari.</p>
                  </article>
                  <article className="dashboard-stat-card checkout-summary-card">
                    <p className="dashboard-stat-label">Kalan tutar</p>
                    <p className="dashboard-stat-value">{formatTryCurrency(paymentSummary.remainingAmount)}</p>
                    <p className="dashboard-stat-note">Tahsil edilmeyi bekleyen TRY bakiye.</p>
                  </article>
                  <article className="dashboard-stat-card checkout-summary-card">
                    <p className="dashboard-stat-label">Bekleyen paylar</p>
                    <p className="dashboard-stat-value">{paymentSummary.unpaidShareCount}</p>
                    <p className="dashboard-stat-note">
                      Beklemede {paymentSummary.pendingShareCount} | Basarisiz {paymentSummary.failedShareCount}
                    </p>
                  </article>
                </div>
              ) : null}

              <div className="section-copy">
                <h4>Olusan odeme paylari</h4>
                <p className="helper-text">Her kartta odeyen kisi, tutar, odeme durumu ve kasiyer aksiyonlari yer alir.</p>
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
                          <p className="meta">{share.guest ? `Misafir: ${share.guest.displayName}` : "Masa bazli odeyen"}</p>
                        </div>
                        <p className="checkout-share-amount">{formatTryCurrency(share.amount)}</p>
                      </div>

                      <div className="badge-row">
                        <span className={`badge ${paymentShareStatusBadgeClass(share.status)}`}>
                          {formatStatusLabel(share.status)}
                        </span>
                        {share.provider ? <span className="badge badge-outline">{paymentProviderLabel(share.provider)}</span> : null}
                        {share.paidAt ? <span className="badge badge-neutral">Odendi {formatShortTime(share.paidAt)}</span> : null}
                      </div>

                      {share.paymentUrl ? (
                        <p className="helper-text">
                          Online odeme linki hazir:{" "}
                          <a className="checkout-link" href={share.paymentUrl} target="_blank" rel="noreferrer">
                            Odeme sayfasini ac
                          </a>
                        </p>
                      ) : null}

                      {share.paidAt ? <p className="meta">Tamamlanma: {formatDateTime(share.paidAt)}</p> : null}

                      {canStartPayment ? (
                        <div className="ticket-actions">
                          <button
                            type="button"
                            className="ticket-action-btn"
                            onClick={() => handleShareAction(share.id, "PAY_BY_CASH")}
                            disabled={actionLocked || isPaid}
                          >
                            {isShareActionRunning(share.id, "PAY_BY_CASH") ? "Nakit baslatiliyor..." : "Nakit al"}
                          </button>
                          <button
                            type="button"
                            className="ticket-action-btn"
                            onClick={() => handleShareAction(share.id, "PAY_BY_CARD")}
                            disabled={actionLocked || isPaid}
                          >
                            {isShareActionRunning(share.id, "PAY_BY_CARD") ? "Kart baslatiliyor..." : "Kart al"}
                          </button>
                          <button
                            type="button"
                            className="ticket-action-btn"
                            onClick={() => handleShareAction(share.id, "SEND_ONLINE_LINK")}
                            disabled={actionLocked || isPaid}
                          >
                            {isShareActionRunning(share.id, "SEND_ONLINE_LINK")
                              ? "Link gonderiliyor..."
                              : "Odeme linki gonder"}
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
                              ? "Tamamlaniyor..."
                              : "Odemeyi tamamla"}
                          </button>
                          <button
                            type="button"
                            className="ticket-action-btn warn"
                            onClick={() => handleShareAction(share.id, "MARK_PAYMENT_FAILED")}
                            disabled={actionLocked}
                          >
                            {isShareActionRunning(share.id, "MARK_PAYMENT_FAILED") ? "Isaretleniyor..." : "Basarisiz isaretle"}
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
                              ? "Isaretleniyor..."
                              : "Mock basarisiz isaretle"}
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
                <h4>Kisi bazli odeme paylari</h4>
                <p className="helper-text">Tahsilata gecmeden once pay dagilimini kontrol edin.</p>
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
                        <strong>{formatTryCurrency(split.amount)}</strong>
                      </p>
                      <p className="meta">Toplam adisyonun {formatPercentage(sharePercent)}lik kismi</p>
                    </article>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="section-copy">
                <h4>Adisyon kalemleri</h4>
                <p className="helper-text">Toplam adisyonu olusturan kalemler.</p>
              </div>
              <div className="list">
                {invoice.lines.map((line) => (
                  <div key={line.id} className="list-item entity-card stack-md">
                    <div className="entity-top">
                      <p>
                        <strong>{line.label}</strong>
                      </p>
                      <span className="badge badge-outline">{formatTryCurrency(line.amount)}</span>
                    </div>
                    <p className="meta">{line.guest ? `Atandi: ${line.guest.displayName}` : "Paylasilan kalem"}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="panel">
          <p className="empty empty-state">Henuz adisyon hesaplanmadi. Acik bir oturum ve bolusum tipi secerek baslayin.</p>
        </section>
      )}
    </div>
  );
}

