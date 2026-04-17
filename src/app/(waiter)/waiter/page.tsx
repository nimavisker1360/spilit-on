"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { useRealtimeEvents } from "@/hooks/use-realtime-events";

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

  return (
    <div className="stack-md">
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Waiter dashboard</h2>
            <p className="meta">Open table sessions and send waiter orders to kitchen.</p>
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
        {message ? <p className="success">{message}</p> : null}
      </section>

      <section className="grid-2">
        <form className="form-card stack-md" onSubmit={handleOpenSession}>
          <h3>Open session</h3>
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
          <button type="submit">Open table</button>
        </form>

        <form className="form-card stack-md" onSubmit={handlePlaceOrder}>
          <h3>Waiter order</h3>
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
                  {session.branch.name} - {session.table.name} ({session.id.slice(0, 8)})
                </option>
              ))}
            </select>
          </label>

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
                  {item.name} - ${Number(item.price).toFixed(2)}
                </option>
              ))}
            </select>
          </label>

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
      </section>

      <section className="panel stack-md">
        <h3>Open sessions</h3>
        {sessions.length === 0 ? <p className="empty">No open sessions.</p> : null}
        <div className="list">
          {sessions.map((session) => {
            const kitchenCounts = getSessionKitchenCounts(session);
            const activeKitchenItems = kitchenCounts.PENDING + kitchenCounts.IN_PROGRESS + kitchenCounts.READY;

            return (
              <article key={session.id} className="list-item">
                <div className="section-head">
                  <div>
                    <strong>
                      {session.branch.name} - {session.table.name}
                    </strong>
                    <p className="meta">
                      Code: {session.table.code} | Session: {session.id.slice(0, 8)} | Opened:{" "}
                      {new Date(session.openedAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="badge">{session.guests.length} guests</span>
                </div>
                {session.guests.length === 0 ? (
                  <p className="meta">No guests joined yet.</p>
                ) : (
                  <p className="meta">Guests: {session.guests.map((guest) => guest.displayName).join(", ")}</p>
                )}

                <p className="meta">
                  Orders: {session.orders.length} | Active kitchen items: {activeKitchenItems}
                </p>
                <p className="meta">
                  Kitchen status: PENDING {kitchenCounts.PENDING} | IN_PROGRESS {kitchenCounts.IN_PROGRESS} | READY{" "}
                  {kitchenCounts.READY} | SERVED {kitchenCounts.SERVED}
                </p>

                {session.orders.length > 0 ? (
                  <div className="list">
                    {[...session.orders]
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .slice(0, 3)
                      .map((order) => (
                        <div key={order.id} className="list-item">
                          <p>
                            <strong>{order.source}</strong> | {order.status} | {new Date(order.createdAt).toLocaleTimeString()}
                          </p>
                          <p className="meta">
                            {order.items.map((item) => `${item.itemName} x${item.quantity} (${item.status})`).join(", ")}
                          </p>
                        </div>
                      ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
