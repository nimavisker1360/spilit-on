"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { useDashboardLanguage } from "@/components/layout/dashboard-language";
import { useRealtimeEvents } from "@/hooks/use-realtime-events";
import { formatTryCurrency } from "@/lib/currency";

type TableRef = {
  id: string;
  name: string;
  code: string;
};

type BranchSnapshot = {
  id: string;
  name: string;
  tables: TableRef[];
  menuCategories: Array<{
    id: string;
    name: string;
    items: Array<{ id: string; name: string; price: string }>;
  }>;
};

type RestaurantSnapshot = {
  id: string;
  branches: BranchSnapshot[];
};

type Guest = {
  id: string;
  displayName: string;
};

type OpenSession = {
  id: string;
  branchId: string;
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
  orders: Array<{
    id: string;
    source: "CUSTOMER" | "WAITER";
    status: "PENDING" | "IN_PROGRESS" | "READY" | "COMPLETED" | "CANCELLED";
    createdAt: string;
    placedByGuest: Guest | null;
    items: Array<{
      id: string;
      itemName: string;
      quantity: number;
      status: "PENDING" | "IN_PROGRESS" | "READY" | "SERVED" | "VOID";
      guest: Guest | null;
    }>;
  }>;
};

type SessionKitchenStatus = OpenSession["orders"][number]["items"][number]["status"];
type OrderSource = OpenSession["orders"][number]["source"];
type OrderStatus = OpenSession["orders"][number]["status"];
type MenuCategory = BranchSnapshot["menuCategories"][number];
type MenuItem = MenuCategory["items"][number];
type GuestOrderItem = {
  id: string;
  itemName: string;
  quantity: number;
  status: SessionKitchenStatus;
  guest: Guest | null;
  source: OrderSource;
  orderStatus: OrderStatus;
  createdAt: string;
};
type GuestOrderGroup = {
  key: string;
  label: string;
  guest: Guest | null;
  items: GuestOrderItem[];
  totalQuantity: number;
  activeQuantity: number;
};

const ALL_GUESTS_KEY = "__all_guests__";
const UNASSIGNED_GUEST_KEY = "__unassigned_guest__";
const ALL_TABLES_KEY = "__all_tables__";

const GUEST_COLORS = ['#3b82f6', '#10b981', '#a855f7', '#ec4899', '#22c55e', '#ef4444'];

function getSessionKitchenCounts(session: OpenSession): Record<SessionKitchenStatus, number> {
  const counts: Record<SessionKitchenStatus, number> = {
    PENDING: 0,
    IN_PROGRESS: 0,
    READY: 0,
    SERVED: 0,
    VOID: 0
  };

  for (const item of session.orders.flatMap((order) => order.items)) {
    counts[item.status] += 1;
  }

  return counts;
}

function formatShortTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatSessionLabel(session: OpenSession): string {
  return `${session.branch.name} - ${session.table.name} - Active session`;
}

function formatSessionSummary(session: OpenSession): string {
  return `Table ${session.table.name} - Opened ${formatShortTime(session.openedAt)}`;
}

function kitchenCountBadgeClass(status: SessionKitchenStatus): string {
  if (status === "PENDING") {
    return "badge badge-status-pending";
  }

  if (status === "IN_PROGRESS") {
    return "badge badge-status-progress";
  }

  if (status === "READY") {
    return "badge badge-status-ready";
  }

  if (status === "SERVED") {
    return "badge badge-status-served";
  }

  return "badge badge-status-closed";
}

function kitchenStatusLabel(status: SessionKitchenStatus): string {
  if (status === "IN_PROGRESS") {
    return "In progress";
  }

  return status.charAt(0) + status.slice(1).toLowerCase();
}

function sourceBadgeClass(source: OrderSource): string {
  if (source === "CUSTOMER") {
    return "badge badge-source-customer";
  }

  return "badge badge-source-waiter";
}

function orderSourceLabel(source: OrderSource): string {
  if (source === "CUSTOMER") {
    return "CUSTOMER";
  }

  return "WAITER";
}

function orderStatusBadgeClass(status: OrderStatus): string {
  if (status === "PENDING") {
    return "badge badge-status-pending";
  }

  if (status === "IN_PROGRESS") {
    return "badge badge-status-progress";
  }

  if (status === "READY") {
    return "badge badge-status-ready";
  }

  if (status === "COMPLETED") {
    return "badge badge-status-served";
  }

  return "badge badge-danger";
}

function orderStatusLabel(status: OrderStatus): string {
  if (status === "IN_PROGRESS") {
    return "In progress";
  }

  if (status === "COMPLETED") {
    return "Served";
  }

  if (status === "CANCELLED") {
    return "Cancelled";
  }

  return status.charAt(0) + status.slice(1).toLowerCase();
}

function getSessionGuestOrderGroups(session: OpenSession): GuestOrderGroup[] {
  const groups: GuestOrderGroup[] = session.guests.map((guest) => ({
    key: guest.id,
    label: guest.displayName,
    guest,
    items: [],
    totalQuantity: 0,
    activeQuantity: 0
  }));
  const groupMap = new Map(groups.map((group) => [group.key, group]));

  for (const order of [...session.orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())) {
    for (const item of order.items) {
      const guest = item.guest ?? order.placedByGuest ?? null;
      const groupKey = guest?.id ?? UNASSIGNED_GUEST_KEY;

      let group = groupMap.get(groupKey);
      if (!group) {
        group = {
          key: groupKey,
          label: guest?.displayName ?? "Unassigned items",
          guest,
          items: [],
          totalQuantity: 0,
          activeQuantity: 0
        };
        groupMap.set(groupKey, group);
        groups.push(group);
      }

      group.items.push({
        id: item.id,
        itemName: item.itemName,
        quantity: item.quantity,
        status: item.status,
        guest,
        source: order.source,
        orderStatus: order.status,
        createdAt: order.createdAt
      });
      group.totalQuantity += item.quantity;

      if (item.status === "PENDING" || item.status === "IN_PROGRESS" || item.status === "READY") {
        group.activeQuantity += item.quantity;
      }
    }
  }

  return groups;
}

function formatGuestOrderMeta(group: GuestOrderGroup): string {
  if (group.items.length === 0) {
    return "No items yet";
  }

  return `${group.items.length} line item(s) - ${group.totalQuantity} qty`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const json = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(json.error || `Request failed for ${url}`);
  }

  return json;
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const json = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(json.error || "Request failed");
  }

  return json;
}

async function deleteJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { method: "DELETE" });
  const json = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(json.error || "Delete failed");
  }

  return json;
}

export default function WaiterDashboardPage() {
  const { t } = useDashboardLanguage();
  const [snapshot, setSnapshot] = useState<RestaurantSnapshot[]>([]);
  const [sessions, setSessions] = useState<OpenSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [deletingItemId, setDeletingItemId] = useState("");

  const [openForm, setOpenForm] = useState({ tableCode: "" });
  const [activeMenuCategoryId, setActiveMenuCategoryId] = useState("");
  const [sessionGuestFocus, setSessionGuestFocus] = useState<Record<string, string>>({});
  const [activeTableFilter, setActiveTableFilter] = useState<string>(ALL_TABLES_KEY);

  const [orderForm, setOrderForm] = useState({
    sessionId: "",
    menuItemId: "",
    quantity: "1",
    guestId: ""
  });

  const branches = useMemo(() => snapshot.flatMap((restaurant) => restaurant.branches), [snapshot]);
  const allTables = useMemo(() => branches.flatMap((branch) => branch.tables), [branches]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === orderForm.sessionId) ?? null,
    [sessions, orderForm.sessionId]
  );

  const menuCategoriesForSelectedSession = useMemo(() => {
    if (!selectedSession) {
      return [] as MenuCategory[];
    }

    const branch = branches.find((entry) => entry.id === selectedSession.branch.id);

    if (!branch) {
      return [];
    }

    return branch.menuCategories.filter((category) => category.items.length > 0);
  }, [branches, selectedSession]);

  const activeMenuCategory = useMemo(
    () => menuCategoriesForSelectedSession.find((category) => category.id === activeMenuCategoryId) ?? menuCategoriesForSelectedSession[0] ?? null,
    [activeMenuCategoryId, menuCategoriesForSelectedSession]
  );

  const menuItemsForActiveCategory = useMemo(() => activeMenuCategory?.items ?? [], [activeMenuCategory]);

  const selectedMenuItem = useMemo(() => {
    const allMenuItems = menuCategoriesForSelectedSession.flatMap((category) => category.items);
    return allMenuItems.find((item) => item.id === orderForm.menuItemId) ?? null;
  }, [menuCategoriesForSelectedSession, orderForm.menuItemId]);

  const selectedSessionGuestGroups = useMemo(
    () => (selectedSession ? getSessionGuestOrderGroups(selectedSession) : []),
    [selectedSession]
  );

  const selectedOrderGuest = useMemo(
    () => selectedSession?.guests.find((guest) => guest.id === orderForm.guestId) ?? null,
    [orderForm.guestId, selectedSession]
  );

  async function loadData(options?: { silent?: boolean }) {
    if (!options?.silent) {
      setLoading(true);
    }

    setError("");

    try {
      const [snapshotResponse, sessionsResponse] = await Promise.all([
        fetchJson<{ data: RestaurantSnapshot[] }>("/api/admin/snapshot"),
        fetchJson<{ data: OpenSession[] }>("/api/sessions")
      ]);

      setSnapshot(snapshotResponse.data);
      setSessions(sessionsResponse.data);

      if (!options?.silent && !openForm.tableCode && snapshotResponse.data.length > 0) {
        const firstTable = snapshotResponse.data[0].branches[0]?.tables[0];
        if (firstTable) {
          setOpenForm({ tableCode: firstTable.code });
        }
      }

      if (!options?.silent && !orderForm.sessionId && sessionsResponse.data[0]) {
        setOrderForm((prev) => ({ ...prev, sessionId: sessionsResponse.data[0].id }));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load waiter data");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadData({ silent: true });
    }, 8000);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtimeEvents({
    role: "waiter",
    onEvent: () => {
      void loadData({ silent: true });
    }
  });

  useEffect(() => {
    if (activeTableFilter === ALL_TABLES_KEY) {
      return;
    }

    const stillExists = sessions.some((session) => session.id === activeTableFilter);
    if (!stillExists) {
      setActiveTableFilter(ALL_TABLES_KEY);
    }
  }, [activeTableFilter, sessions]);

  useEffect(() => {
    if (sessions.length === 0) {
      if (orderForm.sessionId || orderForm.menuItemId || orderForm.guestId) {
        setOrderForm({ sessionId: "", menuItemId: "", quantity: "1", guestId: "" });
      }
      return;
    }

    const hasSelectedSession = sessions.some((session) => session.id === orderForm.sessionId);
    if (!hasSelectedSession) {
      setOrderForm((prev) => ({ ...prev, sessionId: sessions[0].id, menuItemId: "", guestId: "" }));
    }
  }, [orderForm.guestId, orderForm.menuItemId, orderForm.sessionId, sessions]);

  useEffect(() => {
    if (menuCategoriesForSelectedSession.length === 0) {
      if (activeMenuCategoryId) {
        setActiveMenuCategoryId("");
      }
      if (orderForm.menuItemId) {
        setOrderForm((prev) => ({ ...prev, menuItemId: "" }));
      }
      return;
    }

    const hasActiveCategory = menuCategoriesForSelectedSession.some((category) => category.id === activeMenuCategoryId);
    if (!hasActiveCategory) {
      setActiveMenuCategoryId(menuCategoriesForSelectedSession[0].id);
    }
  }, [activeMenuCategoryId, menuCategoriesForSelectedSession, orderForm.menuItemId]);

  useEffect(() => {
    if (!activeMenuCategory) {
      return;
    }

    const hasSelectedItem = activeMenuCategory.items.some((item) => item.id === orderForm.menuItemId);
    if (!hasSelectedItem) {
      setOrderForm((prev) => ({ ...prev, menuItemId: activeMenuCategory.items[0]?.id ?? "" }));
    }
  }, [activeMenuCategory, orderForm.menuItemId]);

  useEffect(() => {
    if (!selectedSession) {
      return;
    }

    const hasSelectedGuest = selectedSession.guests.some((guest) => guest.id === orderForm.guestId);
    const firstGuest = selectedSession.guests[0];

    if (selectedSession.guests.length === 0 && orderForm.guestId) {
      setOrderForm((prev) => ({ ...prev, guestId: "" }));
      return;
    }

    if (!hasSelectedGuest && firstGuest) {
      setOrderForm((prev) => ({ ...prev, guestId: firstGuest.id }));
    }
  }, [orderForm.guestId, selectedSession]);

  function stepOrderQuantity(delta: number) {
    const currentQuantity = Number(orderForm.quantity) || 1;
    const nextQuantity = Math.max(1, currentQuantity + delta);
    setOrderForm((prev) => ({ ...prev, quantity: String(nextQuantity) }));
  }

  async function handleOpenSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      const response = await postJson<{ data: { created: boolean } }>("/api/sessions/open", openForm);
      setMessage(response.data.created ? "Table session opened." : "Table already had an open session.");
      await loadData();
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Open session failed");
    }
  }

  async function handlePlaceOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      if (!orderForm.guestId) {
        throw new Error("Select a guest for this order item");
      }

      if (!orderForm.menuItemId) {
        throw new Error("Select a menu item");
      }

      const quantity = Math.max(1, Number(orderForm.quantity) || 1);
      const submittedGuestId = orderForm.guestId;
      const submittedSessionId = orderForm.sessionId;
      const guestForOrder = selectedSession?.guests.find((guest) => guest.id === submittedGuestId) ?? null;
      const itemForOrder = selectedMenuItem;

      await postJson("/api/orders/waiter", {
        sessionId: submittedSessionId,
        items: [
          {
            menuItemId: orderForm.menuItemId,
            quantity,
            guestId: submittedGuestId
          }
        ]
      });

      setMessage(
        `Sent ${itemForOrder?.name ?? "item"} x${quantity} for ${guestForOrder?.displayName ?? "guest"}.`
      );
      setSessionGuestFocus((prev) => ({ ...prev, [submittedSessionId]: submittedGuestId }));
      setOrderForm((prev) => ({ ...prev, quantity: "1" }));
      await loadData();
    } catch (orderError) {
      setError(orderError instanceof Error ? orderError.message : "Order failed");
    }
  }

  async function handleDeleteOrderItem(item: GuestOrderItem, groupLabel: string) {
    const confirmed = window.confirm(
      `Delete ${item.itemName} x${item.quantity} for ${groupLabel}? This removes it from the database.`
    );

    if (!confirmed) {
      return;
    }

    setError("");
    setMessage("");
    setDeletingItemId(item.id);

    try {
      await deleteJson<{ data: unknown }>(`/api/orders/items/${encodeURIComponent(item.id)}`);
      setMessage(`Deleted ${item.itemName} x${item.quantity}.`);
      await loadData({ silent: true });
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete order item failed");
    } finally {
      setDeletingItemId((current) => (current === item.id ? "" : current));
    }
  }

  const totalGuests = sessions.reduce((sum, session) => sum + session.guests.length, 0);
  const totalOrders = sessions.reduce((sum, session) => sum + session.orders.length, 0);
  const totalActiveKitchenItems = sessions.reduce((sum, session) => {
    const counts = getSessionKitchenCounts(session);
    return sum + counts.PENDING + counts.IN_PROGRESS + counts.READY;
  }, 0);
  const selectedSessionKitchenCounts = selectedSession ? getSessionKitchenCounts(selectedSession) : null;
  const selectedGuestPreview =
    selectedSessionGuestGroups.find((group) => group.key === orderForm.guestId) ?? selectedSessionGuestGroups[0] ?? null;
  const localizedSessionLabel = (session: OpenSession) =>
    t(`${session.branch.name} - ${session.table.name} - Active session`, `${session.branch.name} - ${session.table.name} - Aktif oturum`);
  const localizedSessionSummary = (session: OpenSession) =>
    t(`Table ${session.table.name} - Opened ${formatShortTime(session.openedAt)}`, `Masa ${session.table.name} - Acilis ${formatShortTime(session.openedAt)}`);
  const localizedGuestOrderMeta = (group: GuestOrderGroup) =>
    group.items.length === 0
      ? t("No items yet", "Henuz urun yok")
      : t(`${group.items.length} line item(s) - ${group.totalQuantity} qty`, `${group.items.length} satir - ${group.totalQuantity} adet`);
  const localizedKitchenStatus = (status: SessionKitchenStatus) =>
    status === "IN_PROGRESS"
      ? t("In progress", "Hazirlaniyor")
      : status === "READY"
        ? t("Ready", "Hazir")
        : status === "SERVED"
          ? t("Served", "Servis edildi")
          : status === "PENDING"
            ? t("Pending", "Bekliyor")
            : t("Void", "Iptal");
  const localizedOrderStatus = (status: OrderStatus) =>
    status === "IN_PROGRESS"
      ? t("In progress", "Hazirlaniyor")
      : status === "COMPLETED"
        ? t("Served", "Servis edildi")
        : status === "CANCELLED"
          ? t("Cancelled", "Iptal edildi")
          : status === "READY"
            ? t("Ready", "Hazir")
            : t("Pending", "Bekliyor");
  const localizedOrderSource = (source: OrderSource) => (source === "CUSTOMER" ? t("CUSTOMER", "MUSTERI") : t("WAITER", "GARSON"));

  return (
    <div className="waiter-page stack-md">
      <section className="waiter-hero stack-md">
        <div className="section-head waiter-hero-head">
          <div className="dashboard-hero-copy">
            <p className="section-kicker">{t("Floor control", "Salon kontrolu")}</p>
            <h2>{t("Waiter dashboard", "Garson paneli")}</h2>
            <p className="panel-subtitle">
              {t(
                "Open tables, confirm guest joins, and place waiter-assisted orders with clearer guest ownership.",
                "Masalari acin, misafir katilimini onaylayin ve garson destekli siparisleri daha net misafir sahipligiyle girin."
              )}
            </p>
          </div>
          <button
            type="button"
            className="waiter-refresh-btn"
            onClick={() => {
              void loadData();
            }}
          >
            {t("Refresh", "Yenile")}
          </button>
        </div>

        <div className="dashboard-stat-grid waiter-stat-grid">
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">{t("Open sessions", "Acik oturumlar")}</p>
            <p className="dashboard-stat-value">{sessions.length}</p>
            <p className="dashboard-stat-note">{t("Tables currently active on the floor.", "Su anda salonda aktif olan masalar.")}</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">{t("Guests seated", "Oturan misafirler")}</p>
            <p className="dashboard-stat-value">{totalGuests}</p>
            <p className="dashboard-stat-note">{t("Joined diners across every open session.", "Tum acik oturumlardaki katilan misafirler.")}</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">{t("Orders placed", "Verilen siparisler")}</p>
            <p className="dashboard-stat-value">{totalOrders}</p>
            <p className="dashboard-stat-note">{t("Order tickets currently visible on the floor.", "Su anda salonda gorunen siparis fisleri.")}</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">{t("Kitchen active", "Aktif mutfak")}</p>
            <p className="dashboard-stat-value">{totalActiveKitchenItems}</p>
            <p className="dashboard-stat-note">{t("Items still pending, cooking, or ready for handoff.", "Hala bekleyen, hazirlanan veya servise hazir urunler.")}</p>
          </article>
        </div>

        <div className="status-stack">
          {loading ? <p className="status-banner is-neutral">{t("Loading current floor status.", "Guncel salon durumu yukleniyor.")}</p> : null}
          {error ? <p className="status-banner is-error">{error}</p> : null}
          {message ? <p className="status-banner is-success">{message}</p> : null}
        </div>
      </section>

      <section className="panel dashboard-briefing-panel waiter-briefing-panel">
        <div className="section-head">
          <div className="section-copy">
            <p className="section-kicker">{t("Service script", "Servis akisi")}</p>
            <h3>{t("Make the waiter flow feel guided instead of operational", "Garson akisinin operasyonel degil yonlendirmeli hissettirmesini saglayin")}</h3>
            <p className="panel-subtitle">
              {t(
                "This screen now works best as the middle scene of the demo: seat the table, assign the guest, and push the order to the kitchen in one visible sequence.",
                "Bu ekran demonun orta bolumunde en iyi sonucu verir: masayi acin, misafiri atayin ve siparisi gorunur tek bir akista mutfaga gonderin."
              )}
            </p>
          </div>
        </div>

        <div className="dashboard-story-grid dashboard-story-grid--three">
          <article className="dashboard-story-card">
            <span className="dashboard-story-step">01</span>
            <h4>{t("Seat and confirm the table", "Masayi acin ve onaylayin")}</h4>
            <p>
              {selectedSession
                ? t(
                    `Table ${selectedSession.table.name} is already open with ${selectedSession.guests.length} joined guest(s).`,
                    `${selectedSession.table.name} masasi zaten acik ve ${selectedSession.guests.length} misafir katildi.`
                  )
                : t("Open a table first so guests can join through QR and orders can be routed correctly.", "Once bir masa acin ki misafirler QR ile katilabilsin ve siparisler dogru yonlendirilsin.")}
            </p>
            <span className="dashboard-story-meta">{t("This is where the waiter proves the floor is live.", "Garson salondaki akisin canli oldugunu burada gosterir.")}</span>
          </article>
          <article className="dashboard-story-card">
            <span className="dashboard-story-step">02</span>
            <h4>{t("Assign each item to a real guest", "Her urunu gercek bir misafire atayin")}</h4>
            <p>
              {selectedGuestPreview
                ? t(
                    `${selectedGuestPreview.label} currently shows ${selectedGuestPreview.totalQuantity} total item(s) with ${selectedGuestPreview.activeQuantity} still active.`,
                    `${selectedGuestPreview.label} icin toplam ${selectedGuestPreview.totalQuantity} urun gorunuyor ve bunlarin ${selectedGuestPreview.activeQuantity} adedi hala aktif.`
                  )
                : t("Choose a guest to keep ownership clear before the item is sent.", "Urunu gondermeden once sahipligi net tutmak icin bir misafir secin.")}
            </p>
            <span className="dashboard-story-meta">{t("Guest ownership stays visible for split billing later.", "Misafir sahipligi daha sonra hesap bolme icin gorunur kalir.")}</span>
          </article>
          <article className="dashboard-story-card">
            <span className="dashboard-story-step">03</span>
            <h4>{t("Push the order into kitchen flow", "Siparisi mutfak akisina gonderin")}</h4>
            <p>
              {selectedMenuItem
                ? t(
                    `${selectedMenuItem.name} is ready to send at ${formatTryCurrency(selectedMenuItem.price)}.`,
                    `${selectedMenuItem.name} ${formatTryCurrency(selectedMenuItem.price)} fiyatla gonderilmeye hazir.`
                  )
                : t("Pick a menu item and quantity, then send it straight to the kitchen board.", "Bir menu urunu ve miktar secin, sonra dogrudan mutfak panosuna gonderin.")}
            </p>
            <span className="dashboard-story-meta">{t("The same ticket will appear immediately in the kitchen role.", "Ayni fis aninda mutfak ekraninda gorunecektir.")}</span>
          </article>
        </div>

        <div className="dashboard-pulse-strip">
          <article className="dashboard-pulse-card">
            <span className="dashboard-pulse-label">{t("Focused table", "Odak masa")}</span>
            <strong className="dashboard-pulse-value">{selectedSession ? t(`Table ${selectedSession.table.name}`, `Masa ${selectedSession.table.name}`) : t("No table selected", "Masa secilmedi")}</strong>
            <span className="dashboard-pulse-meta">
              {selectedSession ? selectedSession.branch.name : t("Pick an open session from the live floor.", "Canli salondan acik bir oturum secin.")}
            </span>
          </article>
          <article className="dashboard-pulse-card">
            <span className="dashboard-pulse-label">{t("Guests ready", "Hazir misafirler")}</span>
            <strong className="dashboard-pulse-value">{selectedSession?.guests.length ?? 0}</strong>
            <span className="dashboard-pulse-meta">
              {selectedGuestPreview ? selectedGuestPreview.label : t("Guest picker activates after a table is chosen.", "Misafir secici masa secildikten sonra aktif olur.")}
            </span>
          </article>
          <article className="dashboard-pulse-card">
            <span className="dashboard-pulse-label">{t("Kitchen pressure", "Mutfak yogunlugu")}</span>
            <strong className="dashboard-pulse-value">
              {selectedSessionKitchenCounts
                ? selectedSessionKitchenCounts.PENDING + selectedSessionKitchenCounts.IN_PROGRESS + selectedSessionKitchenCounts.READY
                : 0}
            </strong>
            <span className="dashboard-pulse-meta">
              {selectedSessionKitchenCounts
                ? t(
                    `${selectedSessionKitchenCounts.PENDING} pending, ${selectedSessionKitchenCounts.READY} ready`,
                    `${selectedSessionKitchenCounts.PENDING} bekleyen, ${selectedSessionKitchenCounts.READY} hazir`
                  )
                : t("No active kitchen items for the selected session yet.", "Secili oturum icin henuz aktif mutfak urunu yok.")}
            </span>
          </article>
        </div>
      </section>

      <section className="section-block">
        <div className="section-copy">
          <p className="section-kicker">{t("Actions", "Islemler")}</p>
          <h3>{t("Session and order tools", "Oturum ve siparis araclari")}</h3>
          <p className="panel-subtitle">{t("The workflow stays the same, but the menu and guest selection are much easier to read.", "Akis ayni kalir ancak menu ve misafir secimi artik cok daha okunaklidir.")}</p>
        </div>

        <div className="waiter-actions-grid">
          <form className="form-card stack-md waiter-open-session-card" onSubmit={handleOpenSession}>
            <div className="section-copy">
              <h3>{t("Open session", "Oturum ac")}</h3>
              <p className="helper-text">{t("Use this when guests arrive and the table has not been opened yet.", "Misafirler geldiyse ve masa henuz acilmadiysa bunu kullanin.")}</p>
            </div>
            <label>
              {t("Table", "Masa")}
              <select
                value={openForm.tableCode}
                onChange={(event) => setOpenForm({ tableCode: event.target.value })}
                required
              >
                <option value="">{t("Select table", "Masa secin")}</option>
                {allTables.map((table) => (
                  <option key={table.id} value={table.code}>
                    {table.name} ({table.code})
                  </option>
                ))}
              </select>
            </label>
            <p className="helper-text">{t("Opening here keeps QR join, ordering, and routing behavior exactly the same.", "Buradan acmak QR katilimi, siparis ve yonlendirme davranisini aynen korur.")}</p>
            <button type="submit">{t("Open table", "Masayi ac")}</button>
          </form>

          <form className="form-card stack-md waiter-order-form" onSubmit={handlePlaceOrder}>
            <div className="section-copy">
              <h3>{t("Waiter order", "Garson siparisi")}</h3>
              <p className="helper-text">{t("Follow the steps below to assign and send an item to the kitchen.", "Bir urunu atamak ve mutfaga gondermek icin asagidaki adimlari izleyin.")}</p>
            </div>

            <div className="waiter-step-section">
              <div className="waiter-step-header">
                <span className="waiter-step-badge">1</span>
                <div className="waiter-step-header-copy">
                  <h4>{t("Session", "Oturum")}</h4>
                  <p>{t("Choose the active table", "Aktif masayi secin")}</p>
                </div>
              </div>
              <label>
                {t("Table session", "Masa oturumu")}
                <select
                  value={orderForm.sessionId}
                  onChange={(event) =>
                    setOrderForm({ sessionId: event.target.value, menuItemId: "", quantity: "1", guestId: "" })
                  }
                  required
                >
                  <option value="">{t("Select open session", "Acik oturum secin")}</option>
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {localizedSessionLabel(session)}
                    </option>
                  ))}
                </select>
              </label>

              {selectedSession ? (
                <div className="selection-summary stack-md">
                  <div className="badge-row">
                    <span className="badge badge-outline">{selectedSession.branch.name}</span>
                    <span className="badge badge-neutral">{t(`Table ${selectedSession.table.name}`, `Masa ${selectedSession.table.name}`)}</span>
                    <span className="badge badge-status-open">{t(`${selectedSession.guests.length} guests joined`, `${selectedSession.guests.length} misafir katildi`)}</span>
                  </div>
                  <p className="helper-text">{localizedSessionSummary(selectedSession)}</p>
                </div>
              ) : (
                <p className="helper-text">{t("Select an open session to load guests and branch menu items.", "Misafirleri ve sube menu urunlerini yuklemek icin acik bir oturum secin.")}</p>
              )}
            </div>

            {selectedSession && selectedSession.guests.length > 0 ? (
              <div className="waiter-step-section">
                <div className="waiter-step-header">
                  <span className="waiter-step-badge">2</span>
                  <div className="waiter-step-header-copy">
                    <h4>{t("Guest", "Misafir")}</h4>
                    <p>{t("Who should this item be assigned to?", "Bu urun hangi misafire atanacak?")}</p>
                  </div>
                </div>
                <div className="waiter-guest-picker">
                  {selectedSession.guests.map((guest, guestIndex) => {
                    const guestGroup = selectedSessionGuestGroups.find((group) => group.key === guest.id);
                    const isActive = guest.id === orderForm.guestId;
                    const guestColor = GUEST_COLORS[guestIndex % GUEST_COLORS.length];

                    return (
                      <button
                        key={guest.id}
                        type="button"
                        className={`waiter-guest-card${isActive ? " is-active" : ""}`}
                        style={
                          isActive
                            ? { borderColor: guestColor, background: `${guestColor}1a`, boxShadow: `0 0 0 2px ${guestColor}40` }
                            : { borderColor: `${guestColor}55` }
                        }
                        onClick={() => setOrderForm((prev) => ({ ...prev, guestId: guest.id }))}
                        aria-pressed={isActive}
                      >
                        <div className="waiter-guest-avatar" style={{ background: guestColor }}>
                          {guest.displayName.charAt(0).toUpperCase()}
                        </div>
                        <span className="waiter-guest-card-name">{guest.displayName}</span>
                        <span className="waiter-guest-card-meta">
                          {guestGroup ? localizedGuestOrderMeta(guestGroup) : t("No items yet", "Henuz urun yok")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="waiter-step-section">
              <div className="waiter-step-header">
                <span className="waiter-step-badge">3</span>
                <div className="waiter-step-header-copy">
                  <h4>{t("Menu item", "Menu urunu")}</h4>
                  <p>{t("Pick a category, then tap an item to select it", "Bir kategori secin, sonra urune dokunup secin")}</p>
                </div>
              </div>
              <div className="waiter-menu-block">
                {selectedSession && menuCategoriesForSelectedSession.length > 0 ? (
                  <>
                    <div className="menu-category-scroller" role="tablist" aria-label={t("Waiter menu categories", "Garson menu kategorileri")}>
                      {menuCategoriesForSelectedSession.map((category) => {
                        const isActive = category.id === activeMenuCategory?.id;

                        return (
                          <button
                            key={category.id}
                            type="button"
                            className={`menu-category-chip${isActive ? " is-active" : ""}`}
                            onClick={() => setActiveMenuCategoryId(category.id)}
                            aria-pressed={isActive}
                          >
                            <span>{category.name}</span>
                            <span className="menu-category-count">{category.items.length}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="waiter-menu-item-grid">
                      {menuItemsForActiveCategory.map((item) => {
                        const isSelected = item.id === orderForm.menuItemId;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`menu-item-card waiter-menu-item-card${isSelected ? " is-selected" : ""}`}
                            onClick={() => setOrderForm((prev) => ({ ...prev, menuItemId: item.id }))}
                            aria-pressed={isSelected}
                          >
                            <div className="menu-item-head">
                              <h4>{item.name}</h4>
                              <span className="menu-item-price">{formatTryCurrency(item.price)}</span>
                            </div>
                            <p className="menu-item-description">
                              {selectedOrderGuest ? t(`Assign to ${selectedOrderGuest.displayName}`, `${selectedOrderGuest.displayName} icin ata`) : t("Choose a guest and tap to select.", "Bir misafir secin ve urune dokunun.")}
                            </p>
                            <div className="badge-row menu-item-meta">
                              {activeMenuCategory ? <span className="badge badge-outline">{activeMenuCategory.name}</span> : null}
                              {isSelected ? <span className="badge badge-status-open">{t("Selected", "Secildi")}</span> : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </div>

              {selectedSession && menuCategoriesForSelectedSession.length === 0 ? (
                <p className="helper-text">{t("No menu items were found for this branch yet.", "Bu sube icin henuz menu urunu bulunamadi.")}</p>
              ) : null}
            </div>

            <div className="waiter-step-section">
              <div className="waiter-step-header">
                <span className="waiter-step-badge">4</span>
                <div className="waiter-step-header-copy">
                  <h4>{t("Quantity", "Adet")}</h4>
                  <p>{t("How many of this item to send?", "Bu urunden kac adet gonderilecek?")}</p>
                </div>
              </div>
              <div className="quantity-stepper waiter-quantity-stepper">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => stepOrderQuantity(-1)}
                  disabled={!selectedMenuItem || Number(orderForm.quantity) <= 1}
                  aria-label={t("Decrease quantity", "Adedi azalt")}
                >
                  -
                </button>
                <input
                  id="waiter-order-quantity"
                  type="number"
                  min={1}
                  aria-label={t("Quantity", "Adet")}
                  inputMode="numeric"
                  value={orderForm.quantity}
                  onChange={(event) => setOrderForm((prev) => ({ ...prev, quantity: event.target.value }))}
                  onBlur={() =>
                    setOrderForm((prev) => ({ ...prev, quantity: String(Math.max(1, Number(prev.quantity) || 1)) }))
                  }
                  required
                />
                <button
                  type="button"
                  className="secondary"
                  onClick={() => stepOrderQuantity(1)}
                  disabled={!selectedMenuItem}
                  aria-label={t("Increase quantity", "Adedi arttir")}
                >
                  +
                </button>
              </div>
            </div>

            {(selectedMenuItem || selectedOrderGuest) && (
              <div className="waiter-order-summary-card">
                <div className="section-copy">
                  <p className="section-kicker">{t("Ready to send", "Gonderime hazir")}</p>
                  <h4>{selectedMenuItem?.name ?? t("Select an item", "Bir urun secin")}</h4>
                  <p className="helper-text">
                    {selectedOrderGuest ? t(`Guest: ${selectedOrderGuest.displayName}`, `Misafir: ${selectedOrderGuest.displayName}`) : t("Choose the guest who owns this item.", "Bu urunun ait oldugu misafiri secin.")}
                  </p>
                </div>
                <div className="badge-row">
                  {selectedMenuItem ? <span className="badge badge-outline">{formatTryCurrency(selectedMenuItem.price)}</span> : null}
                  <span className="badge badge-neutral">{t("Qty", "Adet")} {Math.max(1, Number(orderForm.quantity) || 1)}</span>
                  {activeMenuCategory ? <span className="badge badge-status-progress">{activeMenuCategory.name}</span> : null}
                </div>
              </div>
            )}

            <button
              type="submit"
              className="waiter-cta-btn"
              disabled={!selectedSession || selectedSession.guests.length === 0 || !selectedMenuItem || !orderForm.guestId}
            >
              {t("Send to kitchen", "Mutfaga gonder")}
            </button>
            {selectedSession && selectedSession.guests.length === 0 ? (
              <p className="meta">{t("No guests in this session yet. Ask guests to join before ordering.", "Bu oturumda henuz misafir yok. Siparis vermeden once misafirlerin katilmasini isteyin.")}</p>
            ) : null}
          </form>
        </div>
      </section>

      <section className="waiter-live-section stack-md">
        <div className="section-head">
          <div className="section-copy">
            <p className="section-kicker">{t("Live floor", "Canli salon")}</p>
            <h3>{t("Open sessions", "Acik oturumlar")}</h3>
            <p className="panel-subtitle">{t("Every guest now has a clearer button and a full item list instead of a cramped order summary.", "Artik her misafirin daha net bir butonu ve sikisik siparis ozeti yerine tam urun listesi var.")}</p>
          </div>
        </div>
        {sessions.length === 0 ? <p className="empty empty-state">{t("No open sessions. Open a table to start guest ordering.", "Acik oturum yok. Misafir siparisini baslatmak icin bir masa acin.")}</p> : null}

        {sessions.length > 0 ? (
          <div className="table-filter-bar" role="tablist" aria-label={t("Filter by table", "Masaya gore filtrele")}>
            <button
              type="button"
              className={`table-filter-chip${activeTableFilter === ALL_TABLES_KEY ? " is-active" : ""}`}
              onClick={() => setActiveTableFilter(ALL_TABLES_KEY)}
              aria-pressed={activeTableFilter === ALL_TABLES_KEY}
            >
              <span>{t("All tables", "Tum masalar")}</span>
              <span className="table-filter-chip-count">{sessions.length}</span>
            </button>
            {sessions.map((session) => {
              const counts = getSessionKitchenCounts(session);
              const activeCount = counts.PENDING + counts.IN_PROGRESS + counts.READY;
              const hasPending = counts.PENDING > 0;
              const isActive = activeTableFilter === session.id;

              return (
                <button
                  key={session.id}
                  type="button"
                  className={`table-filter-chip${isActive ? " is-active" : ""}${hasPending ? " has-pending" : ""}`}
                  onClick={() => setActiveTableFilter(session.id)}
                  aria-pressed={isActive}
                  title={formatSessionLabel(session)}
                >
                  <span>{t(`Table ${session.table.name}`, `Masa ${session.table.name}`)}</span>
                  <span className="table-filter-chip-count">{activeCount}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="list">
          {(activeTableFilter === ALL_TABLES_KEY
            ? sessions
            : sessions.filter((session) => session.id === activeTableFilter)
          ).map((session) => {
            const kitchenCounts = getSessionKitchenCounts(session);
            const activeKitchenItems = kitchenCounts.PENDING + kitchenCounts.IN_PROGRESS + kitchenCounts.READY;
            const guestOrderGroups = getSessionGuestOrderGroups(session);
            const focusedGuestKey = sessionGuestFocus[session.id];
            const hasFocusedGuest = guestOrderGroups.some((group) => group.key === focusedGuestKey);
            const activeGuestKey = hasFocusedGuest ? focusedGuestKey : ALL_GUESTS_KEY;
            const visibleGuestGroups =
              activeGuestKey === ALL_GUESTS_KEY
                ? guestOrderGroups
                : guestOrderGroups.filter((group) => group.key === activeGuestKey);

            return (
              <article key={session.id} className="list-item entity-card stack-md">
                <div className="entity-top">
                  <div className="entity-title">
                    <h4>{localizedSessionLabel(session)}</h4>
                    <p className="entity-summary">{localizedSessionSummary(session)}</p>
                    <div className="badge-row">
                      <span className="badge badge-outline">{t(`${session.guests.length} guests`, `${session.guests.length} misafir`)}</span>
                      <span className="badge badge-neutral">{t(`${session.orders.length} orders`, `${session.orders.length} siparis`)}</span>
                      <span className="badge badge-status-progress">{t(`${activeKitchenItems} kitchen items active`, `${activeKitchenItems} aktif mutfak urunu`)}</span>
                      {session.readyToCloseAt ? <span className="badge badge-status-paid-payment">{t("Ready to close", "Kapatmaya hazir")}</span> : null}
                    </div>
                  </div>
                </div>

                <div className="detail-grid">
                  <div className="detail-card">
                    <span className="detail-label">{t("Pending", "Bekleyen")}</span>
                    <span className="detail-value">{kitchenCounts.PENDING}</span>
                  </div>
                  <div className="detail-card">
                    <span className="detail-label">{t("In progress", "Hazirlaniyor")}</span>
                    <span className="detail-value">{kitchenCounts.IN_PROGRESS}</span>
                  </div>
                  <div className="detail-card">
                    <span className="detail-label">{t("Ready / served", "Hazir / servis")}</span>
                    <span className="detail-value">
                      {kitchenCounts.READY} / {kitchenCounts.SERVED}
                    </span>
                  </div>
                  <div className="detail-card">
                    <span className="detail-label">{t("Settlement", "Tahsilat")}</span>
                    <span className="detail-value">
                      {session.readyToCloseAt ? t(`Ready since ${formatShortTime(session.readyToCloseAt)}`, `${formatShortTime(session.readyToCloseAt)} itibariyla hazir`) : t("Open", "Acik")}
                    </span>
                  </div>
                </div>

                {session.guests.length === 0 ? (
                  <div className="helper-panel">
                    <p className="helper-text">{t("No guests joined yet. Ask customers to scan the table QR and enter their name.", "Henuz misafir katilmadi. Musterilerden masa QR'ini tarayip adlarini girmelerini isteyin.")}</p>
                  </div>
                ) : (
                  <div className="waiter-session-guest-bar">
                    <button
                      type="button"
                      className={`waiter-session-guest-btn${activeGuestKey === ALL_GUESTS_KEY ? " is-active" : ""}`}
                      onClick={() => setSessionGuestFocus((prev) => ({ ...prev, [session.id]: ALL_GUESTS_KEY }))}
                      aria-pressed={activeGuestKey === ALL_GUESTS_KEY}
                    >
                      <span className="waiter-session-guest-name">{t("All guests", "Tum misafirler")}</span>
                      <span className="waiter-session-guest-meta">{t(`${session.orders.length} order ticket(s)`, `${session.orders.length} siparis fisi`)}</span>
                    </button>
                    {guestOrderGroups.map((group) => {
                      const isActive = group.key === activeGuestKey;
                      const guestIdx = group.guest ? session.guests.findIndex((g) => g.id === group.guest!.id) : -1;
                      const guestColor = guestIdx >= 0 ? GUEST_COLORS[guestIdx % GUEST_COLORS.length] : null;

                      return (
                        <button
                          key={group.key}
                          type="button"
                          className={`waiter-session-guest-btn${isActive ? " is-active" : ""}${group.items.length === 0 ? " is-muted" : ""}`}
                          onClick={() => setSessionGuestFocus((prev) => ({ ...prev, [session.id]: group.key }))}
                          aria-pressed={isActive}
                        >
                          {guestColor ? (
                            <div className="waiter-guest-avatar waiter-guest-avatar-sm" style={{ background: guestColor }}>
                              {group.label.charAt(0).toUpperCase()}
                            </div>
                          ) : null}
                          <span className="waiter-session-guest-name">{group.label}</span>
                          <span className="waiter-session-guest-meta">{localizedGuestOrderMeta(group)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="badge-row">
                  <span className={kitchenCountBadgeClass("PENDING")}>{t("Pending", "Bekleyen")} {kitchenCounts.PENDING}</span>
                  <span className={kitchenCountBadgeClass("IN_PROGRESS")}>{t("In progress", "Hazirlaniyor")} {kitchenCounts.IN_PROGRESS}</span>
                  <span className={kitchenCountBadgeClass("READY")}>{t("Ready", "Hazir")} {kitchenCounts.READY}</span>
                  <span className={kitchenCountBadgeClass("SERVED")}>{t("Served", "Servis")} {kitchenCounts.SERVED}</span>
                </div>

                {session.orders.length > 0 ? (
                  <div className="waiter-guest-order-grid">
                    {visibleGuestGroups.map((group) => (
                      <section
                        key={`${session.id}-${group.key}`}
                        className={`waiter-guest-order-card${activeGuestKey === group.key ? " is-spotlight" : ""}`}
                      >
                        <div className="waiter-guest-order-head">
                          <div className="section-copy">
                            <h4>{group.label}</h4>
                            <p className="helper-text">
                              {group.guest ? t("Every assigned item is shown here in full.", "Atanan her urun burada tam olarak gorunur.") : t("These items should be checked and assigned to a guest.", "Bu urunler kontrol edilmeli ve bir misafire atanmalidir.")}
                            </p>
                          </div>
                          <div className="badge-row waiter-guest-order-summary">
                            <span className="badge badge-outline">{t(`${group.items.length} line item(s)`, `${group.items.length} satir`)}</span>
                            <span className="badge badge-neutral">{t(`${group.totalQuantity} qty`, `${group.totalQuantity} adet`)}</span>
                            <span className="badge badge-status-progress">{t(`${group.activeQuantity} active`, `${group.activeQuantity} aktif`)}</span>
                          </div>
                        </div>

                        {group.items.length > 0 ? (
                          <div className="waiter-guest-order-list">
                            {group.items.map((item) => {
                              const isDeletingItem = deletingItemId === item.id;

                              return (
                                <article key={item.id} className="waiter-guest-order-item">
                                  <div className="waiter-guest-order-item-main">
                                    <div className="waiter-guest-order-item-copy">
                                      <h5>{item.itemName}</h5>
                                      <p>{group.guest ? t(`For ${group.label}`, `${group.label} icin`) : t("Guest not assigned yet", "Henuz misafir atanmedi")}</p>
                                    </div>
                                    <div className="waiter-guest-order-item-side">
                                      <div className="waiter-guest-order-item-actions">
                                        <span className="waiter-guest-order-qty">x{item.quantity}</span>
                                        <button
                                          type="button"
                                          className="waiter-delete-order-item-btn"
                                          onClick={() => void handleDeleteOrderItem(item, group.label)}
                                          disabled={isDeletingItem}
                                          aria-label={t(`Delete ${item.itemName}`, `${item.itemName} sil`)}
                                          title={t("Delete cancelled order", "Iptal edilen siparisi sil")}
                                        >
                                          <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                                            <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z" />
                                            <path d="M6 9h12l-1 11H7L6 9Zm4 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z" />
                                          </svg>
                                        </button>
                                      </div>
                                      <span className="meta">{formatShortTime(item.createdAt)}</span>
                                    </div>
                                  </div>
                                  <div className="badge-row">
                                    <span className={sourceBadgeClass(item.source)}>{localizedOrderSource(item.source)}</span>
                                    <span className={orderStatusBadgeClass(item.orderStatus)}>{localizedOrderStatus(item.orderStatus)}</span>
                                    <span className={kitchenCountBadgeClass(item.status)}>{localizedKitchenStatus(item.status)}</span>
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="waiter-empty-order-card">
                            <p className="helper-text">{t("No items have been assigned to this guest yet.", "Bu misafire henuz urun atanmadi.")}</p>
                          </div>
                        )}
                      </section>
                    ))}
                  </div>
                ) : (
                  <p className="helper-text">{t("No orders have been placed for this session yet.", "Bu oturum icin henuz siparis verilmedi.")}</p>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
