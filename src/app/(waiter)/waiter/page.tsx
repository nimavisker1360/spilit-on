"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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
    items: Array<{
      id: string;
      itemName: string;
      quantity: number;
      status: "PENDING" | "IN_PROGRESS" | "READY" | "SERVED" | "VOID";
    }>;
  }>;
};

type SessionKitchenStatus = OpenSession["orders"][number]["items"][number]["status"];
type OrderSource = OpenSession["orders"][number]["source"];
type OrderStatus = OpenSession["orders"][number]["status"];

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
  return `Table ${session.table.code} • Opened ${formatShortTime(session.openedAt)}`;
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

function formatSessionTableSummary(session: OpenSession): string {
  return formatSessionSummary(session).replace(session.table.code, session.table.name);
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

export default function WaiterDashboardPage() {
  const [snapshot, setSnapshot] = useState<RestaurantSnapshot[]>([]);
  const [sessions, setSessions] = useState<OpenSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [openForm, setOpenForm] = useState({ tableCode: "" });

  const [orderForm, setOrderForm] = useState({
    sessionId: "",
    menuItemId: "",
    quantity: "1",
    guestId: ""
  });

  const branches = useMemo(() => snapshot.flatMap((restaurant) => restaurant.branches), [snapshot]);
  const allTables = useMemo(() => branches.flatMap((branch) => branch.tables), [branches]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === orderForm.sessionId),
    [sessions, orderForm.sessionId]
  );

  const menuItemsForSelectedSession = useMemo(() => {
    if (!selectedSession) {
      return [] as Array<{ id: string; name: string; price: string }>;
    }

    const branch = branches.find((entry) => entry.id === selectedSession.branch.id);

    if (!branch) {
      return [];
    }

    return branch.menuCategories.flatMap((category) => category.items);
  }, [branches, selectedSession]);

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
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadData({ silent: true });
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
    if (!selectedSession) {
      return;
    }

    const firstMenuItem = menuItemsForSelectedSession[0];
    if (firstMenuItem && !orderForm.menuItemId) {
      setOrderForm((prev) => ({ ...prev, menuItemId: firstMenuItem.id }));
    }
  }, [menuItemsForSelectedSession, orderForm.menuItemId, selectedSession]);

  useEffect(() => {
    if (!selectedSession) {
      return;
    }

    const hasSelectedGuest = selectedSession.guests.some((guest) => guest.id === orderForm.guestId);
    const firstGuest = selectedSession.guests[0];

    if (!hasSelectedGuest && firstGuest) {
      setOrderForm((prev) => ({ ...prev, guestId: firstGuest.id }));
    }
  }, [orderForm.guestId, selectedSession]);

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

      await postJson("/api/orders/waiter", {
        sessionId: orderForm.sessionId,
        items: [
          {
            menuItemId: orderForm.menuItemId,
            quantity: Number(orderForm.quantity),
            guestId: orderForm.guestId
          }
        ]
      });

      setMessage("Order sent to kitchen queue.");
      setOrderForm((prev) => ({ ...prev, quantity: "1", guestId: "" }));
      await loadData();
    } catch (orderError) {
      setError(orderError instanceof Error ? orderError.message : "Order failed");
    }
  }

  const totalGuests = sessions.reduce((sum, session) => sum + session.guests.length, 0);
  const totalOrders = sessions.reduce((sum, session) => sum + session.orders.length, 0);
  const totalActiveKitchenItems = sessions.reduce((sum, session) => {
    const counts = getSessionKitchenCounts(session);
    return sum + counts.PENDING + counts.IN_PROGRESS + counts.READY;
  }, 0);

  return (
    <div className="stack-md">
      <section className="panel dashboard-hero stack-md">
        <div className="section-head">
          <div className="dashboard-hero-copy">
            <p className="section-kicker">Floor control</p>
            <h2>Waiter dashboard</h2>
            <p className="panel-subtitle">
              Open tables, confirm guest joins, and place waiter-assisted orders with clear floor visibility.
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
            <p className="dashboard-stat-note">Tables currently active on the floor.</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">Guests seated</p>
            <p className="dashboard-stat-value">{totalGuests}</p>
            <p className="dashboard-stat-note">Joined diners across every open session.</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">Orders placed</p>
            <p className="dashboard-stat-value">{totalOrders}</p>
            <p className="dashboard-stat-note">Order tickets currently visible on the floor.</p>
          </article>
          <article className="dashboard-stat-card">
            <p className="dashboard-stat-label">Kitchen active</p>
            <p className="dashboard-stat-value">{totalActiveKitchenItems}</p>
            <p className="dashboard-stat-note">Items still pending, cooking, or ready for handoff.</p>
          </article>
        </div>

        <div className="status-stack">
          {loading ? <p className="status-banner is-neutral">Loading current floor status.</p> : null}
          {error ? <p className="status-banner is-error">{error}</p> : null}
          {message ? <p className="status-banner is-success">{message}</p> : null}
        </div>
      </section>

      <section className="section-block">
        <div className="section-copy">
          <p className="section-kicker">Actions</p>
          <h3>Session and order tools</h3>
          <p className="panel-subtitle">
            The waiter workflow is unchanged. This view focuses on faster reading and fewer input mistakes.
          </p>
        </div>

        <div className="grid-2">
        <form className="form-card stack-md" onSubmit={handleOpenSession}>
          <div className="section-copy">
            <h3>Open session</h3>
            <p className="helper-text">Use this when guests arrive and the table has not been opened yet.</p>
          </div>
          <label>
            Table
            <select
              value={openForm.tableCode}
              onChange={(event) => setOpenForm({ tableCode: event.target.value })}
              required
            >
              <option value="">Select table</option>
              {allTables.map((table) => (
                <option key={table.id} value={table.code}>
                  {table.name} ({table.code})
                </option>
              ))}
            </select>
          </label>
          <p className="helper-text">Opening here keeps QR join, ordering, and routing behavior exactly the same.</p>
          <button type="submit">Open table</button>
        </form>

        <form className="form-card stack-md" onSubmit={handlePlaceOrder}>
          <div className="section-copy">
            <h3>Waiter order</h3>
            <p className="helper-text">Assign each item to a guest so split billing and kitchen tracking stay accurate.</p>
          </div>
          <label>
            Session
            <select
              value={orderForm.sessionId}
              onChange={(event) =>
                setOrderForm({ sessionId: event.target.value, menuItemId: "", quantity: "1", guestId: "" })
              }
              required
            >
              <option value="">Select open session</option>
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
              <p className="helper-text">{formatSessionTableSummary(selectedSession)}</p>
            </div>
          ) : (
            <p className="helper-text">Select an open session to load guests and branch menu items.</p>
          )}

          <label>
            Menu item
            <select
              value={orderForm.menuItemId}
              onChange={(event) => setOrderForm((prev) => ({ ...prev, menuItemId: event.target.value }))}
              required
            >
              <option value="">Select item</option>
              {menuItemsForSelectedSession.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} - {formatTryCurrency(item.price)}
                </option>
              ))}
            </select>
          </label>

          {selectedSession && menuItemsForSelectedSession.length === 0 ? (
            <p className="helper-text">No menu items were found for this branch yet.</p>
          ) : null}

          <label>
            Quantity
            <input
              type="number"
              min={1}
              value={orderForm.quantity}
              onChange={(event) => setOrderForm((prev) => ({ ...prev, quantity: event.target.value }))}
              required
            />
          </label>

          <label>
            Assign to guest
            <select
              value={orderForm.guestId}
              onChange={(event) => setOrderForm((prev) => ({ ...prev, guestId: event.target.value }))}
              required
            >
              <option value="">Select guest</option>
              {selectedSession?.guests.map((guest) => (
                <option key={guest.id} value={guest.id}>
                  {guest.displayName}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" disabled={!selectedSession || selectedSession.guests.length === 0}>
            Send order
          </button>
          {selectedSession && selectedSession.guests.length === 0 ? (
            <p className="meta">No guests in this session yet. Ask guests to join before ordering.</p>
          ) : null}
        </form>
        </div>
      </section>

      <section className="panel stack-md">
        <div className="section-head">
          <div className="section-copy">
            <p className="section-kicker">Live floor</p>
            <h3>Open sessions</h3>
            <p className="panel-subtitle">Track guest joins, kitchen load, and the most recent tickets at a glance.</p>
          </div>
        </div>
        {sessions.length === 0 ? <p className="empty empty-state">No open sessions. Open a table to start guest ordering.</p> : null}
        <div className="list">
          {sessions.map((session) => {
            const kitchenCounts = getSessionKitchenCounts(session);
            const activeKitchenItems = kitchenCounts.PENDING + kitchenCounts.IN_PROGRESS + kitchenCounts.READY;

            return (
              <article key={session.id} className="list-item entity-card stack-md">
                <div className="entity-top">
                  <div className="entity-title">
                    <h4>
                      {formatSessionLabel(session)}
                    </h4>
                    <p className="entity-summary">{formatSessionTableSummary(session)}</p>
                    <div className="badge-row">
                      <span className="badge badge-outline">{session.guests.length} guests</span>
                      <span className="badge badge-neutral">{session.orders.length} orders</span>
                      <span className="badge badge-status-progress">{activeKitchenItems} kitchen items active</span>
                      {session.readyToCloseAt ? <span className="badge badge-status-paid-payment">Ready to close</span> : null}
                    </div>
                  </div>
                </div>

                <div className="detail-grid">
                  <div className="detail-card">
                    <span className="detail-label">Pending</span>
                    <span className="detail-value">{kitchenCounts.PENDING}</span>
                  </div>
                  <div className="detail-card">
                    <span className="detail-label">In progress</span>
                    <span className="detail-value">{kitchenCounts.IN_PROGRESS}</span>
                  </div>
                  <div className="detail-card">
                    <span className="detail-label">Ready / served</span>
                    <span className="detail-value">
                      {kitchenCounts.READY} / {kitchenCounts.SERVED}
                    </span>
                  </div>
                  <div className="detail-card">
                    <span className="detail-label">Settlement</span>
                    <span className="detail-value">
                      {session.readyToCloseAt ? `Ready since ${formatShortTime(session.readyToCloseAt)}` : "Open"}
                    </span>
                  </div>
                </div>

                {session.guests.length === 0 ? (
                  <div className="helper-panel">
                    <p className="helper-text">No guests joined yet. Ask customers to scan the table QR and enter their name.</p>
                  </div>
                ) : (
                  <div className="guest-strip">
                    {session.guests.map((guest) => (
                      <span key={guest.id} className="guest-chip">
                        {guest.displayName}
                      </span>
                    ))}
                  </div>
                )}

                <div className="badge-row">
                  <span className={kitchenCountBadgeClass("PENDING")}>Pending {kitchenCounts.PENDING}</span>
                  <span className={kitchenCountBadgeClass("IN_PROGRESS")}>In progress {kitchenCounts.IN_PROGRESS}</span>
                  <span className={kitchenCountBadgeClass("READY")}>Ready {kitchenCounts.READY}</span>
                  <span className={kitchenCountBadgeClass("SERVED")}>Served {kitchenCounts.SERVED}</span>
                </div>

                {session.orders.length > 0 ? (
                  <div className="order-preview-list">
                    {[...session.orders]
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .slice(0, 3)
                      .map((order) => (
                        <div key={order.id} className="order-preview-card stack-md">
                          <div className="order-preview-head">
                            <div className="badge-row">
                              <span className={sourceBadgeClass(order.source)}>{orderSourceLabel(order.source)}</span>
                              <span className={orderStatusBadgeClass(order.status)}>{orderStatusLabel(order.status)}</span>
                            </div>
                            <span className="meta">{formatShortTime(order.createdAt)}</span>
                          </div>
                          <p className="meta">
                            {order.items
                              .map((item) => `${item.itemName} x${item.quantity} • ${kitchenStatusLabel(item.status)}`)
                              .join("\n")}
                          </p>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="helper-text">No orders have been placed for this session yet.</p>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
