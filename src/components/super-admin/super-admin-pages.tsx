"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type PageKind =
  | "dashboard"
  | "users"
  | "restaurants"
  | "subscriptions"
  | "payments"
  | "plans"
  | "settings"
  | "audit-logs";

type ApiResponse<T> = {
  data?: T;
  error?: string;
};

type ConfirmState = {
  title: string;
  description: string;
  endpoint: string;
  action: string;
  method?: "PATCH" | "DELETE";
  payload?: Record<string, unknown>;
};

function formatDate(value?: string | Date | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("tr-TR");
}

function formatTry(value?: string | number | null) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(amount);
}

function statusBadge(status: string | null | undefined) {
  const value = status || "-";
  const tone =
    ["ACTIVE", "SUCCEEDED"].includes(value)
      ? "success"
      : ["TRIALING", "PENDING"].includes(value)
        ? "warn"
        : ["SUSPENDED", "CANCELLED", "FAILED", "PAST_DUE"].includes(value)
          ? "danger"
          : "neutral";
  return <span className={`super-admin-badge super-admin-badge--${tone}`}>{value}</span>;
}

function EmptyState({ label }: { label: string }) {
  return <div className="super-admin-empty">{label}</div>;
}

function ErrorState({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="super-admin-error-panel">
      <strong>Hata</strong>
      <span>{error}</span>
      <button type="button" className="secondary" onClick={retry}>
        Tekrar dene
      </button>
    </div>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="super-admin-search">
      Ara
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Tabloda ara..." />
    </label>
  );
}

export function SuperAdminDataPage({ kind }: { kind: PageKind }) {
  const [data, setData] = useState<any>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [rawResponse, setRawResponse] = useState<unknown>(null);
  const endpoint = kind === "dashboard" ? "/api/super-admin/dashboard" : `/api/super-admin/${kind}`;

  const load = async () => {
    setIsLoading(true);
    setError("");
    const response = await fetch(endpoint, { cache: "no-store" });
    const json = (await response.json().catch(() => ({}))) as ApiResponse<unknown>;
    setIsLoading(false);

    if (!response.ok) {
      setError(json.error || "Veri alinamadi.");
      return;
    }

    setData(json.data);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  const filteredRows = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) return data;
    return data.filter((row) => JSON.stringify(row).toLowerCase().includes(normalized));
  }, [data, query]);

  const runConfirmedAction = async () => {
    if (!confirm) return;
    const response = await fetch(confirm.endpoint, {
      method: confirm.method || "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: confirm.action, ...(confirm.payload || {}) }),
    });
    const json = (await response.json().catch(() => ({}))) as ApiResponse<unknown>;

    if (!response.ok) {
      setError(json.error || "Islem basarisiz.");
    }

    setConfirm(null);
    await load();
  };

  if (isLoading) {
    return (
      <section className="super-admin-page">
        <div className="super-admin-loading">Yukleniyor...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="super-admin-page">
        <ErrorState error={error} retry={load} />
      </section>
    );
  }

  if (kind === "dashboard") {
    const cards = [
      ["Kayitli e-posta/kullanici", data.totalUsers],
      ["Toplam restoran", data.totalRestaurants],
      ["Deneme restoranlari", data.trialRestaurants],
      ["Aktif Pro abonelik", data.activeProSubscriptions],
      ["Suresi dolan denemeler", data.expiredTrials],
      ["Aylik gelir", formatTry(data.monthlyRevenue)],
      ["Toplam gelir", formatTry(data.totalRevenue)],
    ];
    return (
      <section className="super-admin-page">
        <header className="super-admin-page-header">
          <div>
            <p>Platform ozeti</p>
            <h1>Super Admin Panel</h1>
          </div>
        </header>
        <div className="super-admin-card-grid">
          {cards.map(([label, value]) => (
            <article key={label} className="super-admin-summary-card">
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
      </section>
    );
  }

  if (kind === "plans") {
    return <PlanEditor plan={data} reload={load} />;
  }

  if (kind === "settings") {
    return <SettingsEditor settings={data} reload={load} />;
  }

  const titleMap: Record<PageKind, string> = {
    dashboard: "Panel",
    users: "Kullanicilar / E-postalar",
    restaurants: "Restoranlar",
    subscriptions: "Abonelikler",
    payments: "Odemeler",
    plans: "Plan",
    settings: "Ayarlar",
    "audit-logs": "Audit Loglari",
  };

  return (
    <section className="super-admin-page">
      <header className="super-admin-page-header">
        <div>
          <p>MasaPayz platform yonetimi</p>
          <h1>{titleMap[kind]}</h1>
        </div>
        <SearchBox value={query} onChange={setQuery} />
      </header>

      {filteredRows.length === 0 ? <EmptyState label="Kayit bulunamadi." /> : null}
      {filteredRows.length > 0 && kind === "users" ? <UsersTable rows={filteredRows} setConfirm={setConfirm} /> : null}
      {filteredRows.length > 0 && kind === "restaurants" ? <RestaurantsTable rows={filteredRows} setConfirm={setConfirm} /> : null}
      {filteredRows.length > 0 && kind === "subscriptions" ? <SubscriptionsTable rows={filteredRows} setConfirm={setConfirm} /> : null}
      {filteredRows.length > 0 && kind === "payments" ? <PaymentsTable rows={filteredRows} showRaw={setRawResponse} /> : null}
      {filteredRows.length > 0 && kind === "audit-logs" ? <AuditLogsTable rows={filteredRows} /> : null}

      {confirm ? (
        <div className="super-admin-modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="super-admin-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>{confirm.title}</h2>
            <p>{confirm.description}</p>
            <div className="super-admin-modal-actions">
              <button type="button" className="danger" onClick={runConfirmedAction}>
                Onayla
              </button>
              <button type="button" className="secondary" onClick={() => setConfirm(null)}>
                Vazgec
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rawResponse !== null ? (
        <div className="super-admin-modal-backdrop" onClick={() => setRawResponse(null)}>
          <div className="super-admin-modal super-admin-modal--wide" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>Ham provider yaniti</h2>
            <pre>{JSON.stringify(rawResponse, null, 2)}</pre>
            <button type="button" className="secondary" onClick={() => setRawResponse(null)}>
              Kapat
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function UsersTable({ rows, setConfirm }: { rows: any[]; setConfirm: (confirm: ConfirmState) => void }) {
  return (
    <div className="super-admin-table-wrap">
      <table className="super-admin-table">
        <thead>
          <tr>
            <th>E-posta</th>
            <th>Ad</th>
            <th>Rol</th>
            <th>Restoran</th>
            <th>Kayit</th>
            <th>Son giris</th>
            <th>Abonelik</th>
            <th>Durum</th>
            <th>Islem</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.email}</td>
              <td>{row.name}</td>
              <td>{row.role}</td>
              <td>{row.relatedRestaurant}</td>
              <td>{formatDate(row.createdAt)}</td>
              <td>{formatDate(row.lastLoginAt)}</td>
              <td>{statusBadge(row.subscriptionStatus)}</td>
              <td>{row.isActive ? statusBadge("ACTIVE") : statusBadge(row.isDeleted ? "DELETED" : "DISABLED")}</td>
              <td>
                <div className="super-admin-actions">
                  {row.relatedRestaurantId ? <Link className="secondary" href={`/super-admin/restaurants/${row.relatedRestaurantId}`}>Gor</Link> : null}
                  {row.isActive ? (
                    <button
                      type="button"
                      className="warn"
                      onClick={() =>
                        setConfirm({
                          title: "Kullaniciyi deaktive et",
                          description: row.isOwner
                            ? "Bu kullanici restoran sahibi. Veri silinmeyecek, sadece giris ve aktif kullanim kapatilacak."
                            : "Kullanici verisi korunacak ve giris kapatilacak.",
                          endpoint: `/api/super-admin/users/${row.id}`,
                          action: "deactivate",
                        })
                      }
                    >
                      Deaktive
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirm({
                          title: "Kullaniciyi tekrar aktif et",
                          description: "Bu kullanicinin platform girisi tekrar acilacak.",
                          endpoint: `/api/super-admin/users/${row.id}`,
                          action: "reactivate",
                        })
                      }
                    >
                      Aktif et
                    </button>
                  )}
                  <button
                    type="button"
                    className="danger"
                    onClick={() =>
                      setConfirm({
                        title: "Kullaniciyi soft delete yap",
                        description: row.isOwner
                          ? "Bu kullanici restoran sahibi. Restoran, siparis ve odeme verileri korunacak; kullanici hard delete edilmeyecek."
                          : "Hard delete yapilmayacak. Kullanici pasif/silinmis olarak isaretlenecek.",
                        endpoint: `/api/super-admin/users/${row.id}`,
                        action: "delete",
                      })
                    }
                  >
                    Sil
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RestaurantsTable({ rows, setConfirm }: { rows: any[]; setConfirm: (confirm: ConfirmState) => void }) {
  const changeOwner = (row: any) => {
    const ownerEmail = window.prompt("Yeni sahip e-postasi");
    if (!ownerEmail) return;
    setConfirm({
      title: "Restoran sahibini degistir",
      description: `${row.name} restoraninin sahibi ${ownerEmail} olarak atanacak.`,
      endpoint: `/api/super-admin/restaurants/${row.id}`,
      action: "change_owner",
      payload: { ownerEmail },
    });
  };

  return (
    <div className="super-admin-table-wrap">
      <table className="super-admin-table">
        <thead>
          <tr>
            <th>Restoran</th>
            <th>Sahip</th>
            <th>Abonelik</th>
            <th>Trial</th>
            <th>Kayit</th>
            <th>Sube</th>
            <th>Masa</th>
            <th>Personel</th>
            <th>Islem</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td><Link href={`/super-admin/restaurants/${row.id}`}>{row.name}</Link></td>
              <td>{row.ownerEmail}</td>
              <td>{statusBadge(row.subscriptionStatus)}</td>
              <td>{row.trialRemainingDays === null ? "-" : `${row.trialRemainingDays} gun`}</td>
              <td>{formatDate(row.createdAt)}</td>
              <td>{row.branchesCount}</td>
              <td>{row.tablesCount}</td>
              <td>{row.staffCount}</td>
              <td>
                <div className="super-admin-actions">
                  <Link className="secondary" href={`/super-admin/restaurants/${row.id}`}>Detay</Link>
                  <button type="button" className="warn" onClick={() => setConfirm({ title: "Restorani askıya al", description: `${row.name} askıya alinacak.`, endpoint: `/api/super-admin/restaurants/${row.id}`, action: "suspend" })}>Askıya al</button>
                  <button type="button" onClick={() => setConfirm({ title: "Restorani aktif et", description: `${row.name} tekrar aktif olacak.`, endpoint: `/api/super-admin/restaurants/${row.id}`, action: "reactivate" })}>Aktif et</button>
                  <button type="button" onClick={() => setConfirm({ title: "Trial sifirla", description: "10 gun veya ayarlardaki trial suresi yeniden baslatilacak.", endpoint: `/api/super-admin/restaurants/${row.id}`, action: "reset_trial" })}>Trial sifirla</button>
                  <button type="button" className="warn" onClick={() => setConfirm({ title: "Trial bitir", description: "Deneme suresi gecmise alinacak ve durum past_due olacak.", endpoint: `/api/super-admin/restaurants/${row.id}`, action: "expire_trial" })}>Trial bitir</button>
                  <button type="button" onClick={() => setConfirm({ title: "Pro aktif et", description: "Restoran manuel olarak aktif Pro abonelige alinacak.", endpoint: `/api/super-admin/restaurants/${row.id}`, action: "activate_pro" })}>Pro aktif</button>
                  <button type="button" className="secondary" onClick={() => changeOwner(row)}>Sahip degistir</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubscriptionsTable({ rows, setConfirm }: { rows: any[]; setConfirm: (confirm: ConfirmState) => void }) {
  const actions = [
    ["force_active_pro", "Pro aktif"],
    ["reset_trial", "Trial sifirla"],
    ["expire_trial", "Trial bitir"],
    ["set_past_due", "Past due"],
    ["cancel", "Iptal"],
  ];
  return (
    <div className="super-admin-table-wrap">
      <table className="super-admin-table">
        <thead>
          <tr>
            <th>Restoran</th>
            <th>Sahip</th>
            <th>Durum</th>
            <th>Trial bitis</th>
            <th>Periyot bitis</th>
            <th>Plan</th>
            <th>Fiyat</th>
            <th>Islem</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td><Link href={`/super-admin/restaurants/${row.restaurantId}`}>{row.restaurant}</Link></td>
              <td>{row.ownerEmail}</td>
              <td>{statusBadge(row.status)}</td>
              <td>{formatDate(row.trialEndsAt)}</td>
              <td>{formatDate(row.currentPeriodEnd)}</td>
              <td>{row.plan}</td>
              <td>{formatTry(row.priceTry)}</td>
              <td>
                <div className="super-admin-actions">
                  {actions.map(([action, label]) => (
                    <button
                      key={action}
                      type="button"
                      className={action === "cancel" ? "danger" : action === "set_past_due" ? "warn" : "secondary"}
                      onClick={() =>
                        setConfirm({
                          title: `${label} islemi`,
                          description: `${row.restaurant} aboneligi icin ${label} uygulanacak.`,
                          endpoint: `/api/super-admin/subscriptions/${row.id}`,
                          action,
                        })
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentsTable({ rows, showRaw }: { rows: any[]; showRaw: (raw: unknown) => void }) {
  return (
    <div className="super-admin-table-wrap">
      <table className="super-admin-table">
        <thead>
          <tr>
            <th>Restoran</th>
            <th>Sahip</th>
            <th>Tutar</th>
            <th>Para</th>
            <th>Provider</th>
            <th>Durum</th>
            <th>Tarih</th>
            <th>Provider ID</th>
            <th>Raw</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td><Link href={`/super-admin/restaurants/${row.restaurantId}`}>{row.restaurant}</Link></td>
              <td>{row.ownerEmail}</td>
              <td>{formatTry(row.amount)}</td>
              <td>{row.currency}</td>
              <td>{row.provider || "iyzico"}</td>
              <td>{statusBadge(row.status)}</td>
              <td>{formatDate(row.paymentDate)}</td>
              <td>{row.providerPaymentId || "-"}</td>
              <td><button type="button" className="secondary" onClick={() => showRaw(row.rawResponse || {})}>Gor</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditLogsTable({ rows }: { rows: any[] }) {
  return (
    <div className="super-admin-table-wrap">
      <table className="super-admin-table">
        <thead>
          <tr>
            <th>Tarih</th>
            <th>Admin</th>
            <th>Aksiyon</th>
            <th>Entity</th>
            <th>ID</th>
            <th>Metadata</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDate(row.createdAt)}</td>
              <td>{row.admin?.email || "-"}</td>
              <td>{row.action}</td>
              <td>{row.entityType}</td>
              <td>{row.entityId || "-"}</td>
              <td><code>{JSON.stringify(row.metadata || {})}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanEditor({ plan, reload }: { plan: any; reload: () => Promise<void> }) {
  const [monthlyPrice, setMonthlyPrice] = useState(String(plan.monthlyPrice || "1499.00"));
  const [trialDays, setTrialDays] = useState(String(plan.trialDays || 10));
  const [trialEnabled, setTrialEnabled] = useState(Boolean(plan.trialEnabled));
  const [isActive, setIsActive] = useState(Boolean(plan.isActive));
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/super-admin/plans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthlyPrice, trialDays: Number(trialDays), trialEnabled, isActive }),
    });
    setMessage(response.ok ? "Plan guncellendi." : "Plan guncellenemedi.");
    await reload();
  };

  return (
    <section className="super-admin-page">
      <header className="super-admin-page-header">
        <div>
          <p>Tek plan modeli</p>
          <h1>Pro Plan</h1>
        </div>
      </header>
      <form className="super-admin-form-grid" onSubmit={submit}>
        <div className="super-admin-plan-card">
          <span>Pro</span>
          <strong>{formatTry(monthlyPrice)} / ay</strong>
          <p>10 gun deneme, tum ozellikler dahil.</p>
        </div>
        <label> Aylik fiyat TRY <input value={monthlyPrice} onChange={(event) => setMonthlyPrice(event.target.value)} inputMode="decimal" /></label>
        <label> Trial gun <input type="number" min={0} value={trialDays} onChange={(event) => setTrialDays(event.target.value)} /></label>
        <label className="super-admin-checkbox"><input type="checkbox" checked={trialEnabled} onChange={(event) => setTrialEnabled(event.target.checked)} /> Trial aktif</label>
        <label className="super-admin-checkbox"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /> Plan aktif</label>
        <button type="submit">Kaydet</button>
        {message ? <p className="super-admin-message">{message}</p> : null}
      </form>
    </section>
  );
}

function SettingsEditor({ settings, reload }: { settings: any; reload: () => Promise<void> }) {
  const [form, setForm] = useState({
    supportEmail: settings.supportEmail || "",
    companyName: settings.companyName || "",
    iyzicoMode: settings.iyzicoMode || "test",
    defaultCurrency: "TRY",
    trialDurationDays: String(settings.trialDurationDays || 10),
    trialEnabled: Boolean(settings.trialEnabled),
    maintenanceMode: Boolean(settings.maintenanceMode),
  });
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/super-admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, trialDurationDays: Number(form.trialDurationDays) }),
    });
    setMessage(response.ok ? "Ayarlar kaydedildi." : "Ayarlar kaydedilemedi.");
    await reload();
  };

  return (
    <section className="super-admin-page">
      <header className="super-admin-page-header">
        <div>
          <p>Platform ayarlari</p>
          <h1>Ayarlar</h1>
        </div>
      </header>
      <form className="super-admin-form-grid" onSubmit={submit}>
        <label>Destek e-postasi <input type="email" value={form.supportEmail} onChange={(event) => setForm({ ...form, supportEmail: event.target.value })} /></label>
        <label>Sirket adi <input value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} /></label>
        <label>Iyzico modu <select value={form.iyzicoMode} onChange={(event) => setForm({ ...form, iyzicoMode: event.target.value })}><option value="test">Test</option><option value="live">Live</option></select></label>
        <label>Varsayilan para birimi <input value="TRY" disabled /></label>
        <label>Trial suresi <input type="number" min={0} value={form.trialDurationDays} onChange={(event) => setForm({ ...form, trialDurationDays: event.target.value })} /></label>
        <label className="super-admin-checkbox"><input type="checkbox" checked={form.trialEnabled} onChange={(event) => setForm({ ...form, trialEnabled: event.target.checked })} /> Trial aktif</label>
        <label className="super-admin-checkbox"><input type="checkbox" checked={form.maintenanceMode} onChange={(event) => setForm({ ...form, maintenanceMode: event.target.checked })} /> Bakim modu</label>
        <button type="submit">Kaydet</button>
        {message ? <p className="super-admin-message">{message}</p> : null}
      </form>
    </section>
  );
}

export function SuperAdminRestaurantDetail({ restaurantId }: { restaurantId: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const loadDetail = async () => {
    setError("");
    await fetch(`/api/super-admin/restaurants/${restaurantId}`)
      .then(async (response) => {
        const json = (await response.json()) as ApiResponse<unknown>;
        if (!response.ok) throw new Error(json.error || "Restoran alinamadi.");
        setData(json.data);
      })
      .catch((nextError: Error) => setError(nextError.message));
  };

  useEffect(() => {
    void loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const runConfirmedAction = async () => {
    if (!confirm) return;
    const response = await fetch(confirm.endpoint, {
      method: confirm.method || "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: confirm.action, ...(confirm.payload || {}) }),
    });
    const json = (await response.json().catch(() => ({}))) as ApiResponse<unknown>;

    if (!response.ok) {
      setError(json.error || "Islem basarisiz.");
    }

    setConfirm(null);
    await loadDetail();
  };

  if (error) return <ErrorState error={error} retry={loadDetail} />;
  if (!data) return <div className="super-admin-loading">Yukleniyor...</div>;

  return (
    <section className="super-admin-page">
      <header className="super-admin-page-header">
        <div>
          <p>Restoran detayi</p>
          <h1>{data.name}</h1>
        </div>
        <Link className="secondary" href="/super-admin/restaurants">Restoranlara don</Link>
      </header>

      <div className="super-admin-detail-grid">
        <article><span>Profil</span><strong>{data.slug}</strong><p>{data.status} / {data.workspaceMode}</p></article>
        <article><span>Sahip</span><strong>{data.owner?.user?.email || "-"}</strong><p>{data.owner?.user?.name || "-"}</p></article>
        <article><span>Masalar</span><strong>{data.tablesCount}</strong><p>{data.branches.length} sube</p></article>
        <article><span>Menu</span><strong>{data.menuCount}</strong><p>Toplam urun</p></article>
      </div>

      <div className="super-admin-two-column">
        <DetailList title="Personel" rows={data.staff.map((item: any) => [item.user.email, item.role, item.status])} />
        <DetailList title="Son siparisler" rows={data.recentOrders.map((item: any) => [item.branchName, item.status, formatDate(item.createdAt)])} />
        <DetailList title="Abonelikler" rows={data.subscriptions.map((item: any) => [item.plan.name, item.status, formatDate(item.currentPeriodEnd)])} />
        <DetailList title="Odeme gecmisi" rows={data.payments.map((item: any) => [formatTry(item.amount), item.status, formatDate(item.createdAt)])} />
        <article className="super-admin-detail-panel"><h2>Admin notlari</h2><p>{data.adminNotes}</p></article>
      </div>

      <BranchWorkspaceManager restaurantId={restaurantId} branches={data.branches} setConfirm={setConfirm} />

      {confirm ? (
        <div className="super-admin-modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="super-admin-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>{confirm.title}</h2>
            <p>{confirm.description}</p>
            <div className="super-admin-modal-actions">
              <button type="button" className="danger" onClick={runConfirmedAction}>
                Onayla
              </button>
              <button type="button" className="secondary" onClick={() => setConfirm(null)}>
                Vazgec
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function BranchWorkspaceManager({
  restaurantId,
  branches,
  setConfirm,
}: {
  restaurantId: string;
  branches: any[];
  setConfirm: (confirm: ConfirmState) => void;
}) {
  return (
    <article className="super-admin-detail-panel super-admin-workspace-panel">
      <h2>Branch ve masa yonetimi</h2>
      {branches.length === 0 ? <p>Bu restoranda branch yok.</p> : null}
      <div className="super-admin-branch-list">
        {branches.map((branch) => (
          <section key={branch.id} className="super-admin-branch-card">
            <div className="super-admin-branch-header">
              <div>
                <strong>{branch.name}</strong>
                <span>
                  {branch.tablesCount} masa / {branch.menuCount} urun
                </span>
              </div>
              <button
                type="button"
                className="danger"
                onClick={() =>
                  setConfirm({
                    title: "Branch silinsin mi?",
                    description:
                      "Bu islem branch icindeki masalari, menu kayitlarini ve bagli kapali oturum verilerini silebilir. Acik oturum varsa islem engellenir.",
                    endpoint: `/api/super-admin/restaurants/${restaurantId}/branches/${branch.id}`,
                    action: "delete_branch",
                    method: "DELETE",
                  })
                }
              >
                Branch sil
              </button>
            </div>

            {branch.tables.length === 0 ? (
              <p className="super-admin-empty-inline">Bu branch icin masa yok.</p>
            ) : (
              <div className="super-admin-table-list">
                {branch.tables.map((table: any) => (
                  <div key={table.id} className="super-admin-table-row-card">
                    <div>
                      <strong>{table.name}</strong>
                      <span>
                        {table.code} / {table.capacity} kisi / {table.status}
                        {table.activeSessionsCount > 0 ? ` / ${table.activeSessionsCount} aktif oturum` : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="danger"
                      onClick={() =>
                        setConfirm({
                          title: "Masa silinsin mi?",
                          description:
                            "Bu masa silinecek. Acik oturum varsa islem engellenir; once oturumu kapatman gerekir.",
                          endpoint: `/api/super-admin/restaurants/${restaurantId}/tables/${table.id}`,
                          action: "delete_table",
                          method: "DELETE",
                        })
                      }
                    >
                      Masa sil
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}

function DetailList({ title, rows }: { title: string; rows: Array<Array<string>> }) {
  return (
    <article className="super-admin-detail-panel">
      <h2>{title}</h2>
      {rows.length === 0 ? <p>Kayit yok.</p> : rows.map((row, index) => (
        <div key={index} className="super-admin-detail-row">
          {row.map((cell, cellIndex) => <span key={cellIndex}>{cell}</span>)}
        </div>
      ))}
    </article>
  );
}
