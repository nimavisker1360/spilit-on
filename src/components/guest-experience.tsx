"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { formatTryCurrency } from "@/lib/currency";
import { clearGuestIdentity, readGuestIdentity, writeGuestIdentity } from "@/lib/guest-identity";

type GuestMenuItem = {
  id: string;
  name: string;
  price: string;
  description: string | null;
  isAvailable: boolean;
};

type GuestMenuCategory = {
  id: string;
  name: string;
  items: GuestMenuItem[];
};

type MenuItemWithCategory = GuestMenuItem & {
  categoryId: string;
};

type GuestState = {
  table: {
    id: string;
    name: string;
    code: string;
    branch: {
      id: string;
      name: string;
    };
  };
  session: {
    id: string;
    guests: Array<{ id: string; displayName: string }>;
  } | null;
  menu: GuestMenuCategory[];
};

type OrderSuccessState = {
  orderId: string;
  itemName: string;
  quantity: number;
};

async function fetchGuestState(tableCode: string): Promise<GuestState> {
  const response = await fetch(`/api/guest/${tableCode}`, { cache: "no-store" });
  const json = (await response.json()) as { data?: GuestState; error?: string };

  if (!response.ok) {
    throw new Error(json.error || "Failed to load guest state");
  }

  if (!json.data) {
    throw new Error("Missing guest state payload");
  }

  return json.data;
}

function formatSessionDisplayLabel(state: GuestState): string {
  return `${state.table.branch.name} \u2022 ${state.table.name} \u2022 Active Session`;
}

function formatOrderReference(orderId: string): string {
  const suffix = orderId.replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase().padStart(4, "0");
  return `ORD-${suffix}`;
}

function normalizeGuestName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function foldGuestName(value: string): string {
  return normalizeGuestName(value).toLocaleLowerCase("tr-TR");
}

type Props = {
  tableCode: string;
};

export function GuestExperience({ tableCode }: Props) {
  const pathname = usePathname();
  const [state, setState] = useState<GuestState | null>(null);
  const [guestId, setGuestId] = useState("");
  const [joinName, setJoinName] = useState("");
  const [menuItemId, setMenuItemId] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [itemNote, setItemNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [orderSuccess, setOrderSuccess] = useState<OrderSuccessState | null>(null);

  const menuItems = useMemo<MenuItemWithCategory[]>(
    () =>
      state?.menu.flatMap((category) =>
        category.items.map((item) => ({
          ...item,
          categoryId: category.id
        }))
      ) ?? [],
    [state]
  );

  const activeCategory = useMemo(
    () => state?.menu.find((category) => category.id === activeCategoryId) ?? state?.menu[0] ?? null,
    [activeCategoryId, state]
  );

  const selectedMenuItem = useMemo(() => menuItems.find((item) => item.id === menuItemId) ?? null, [menuItemId, menuItems]);
  const joinedGuest = useMemo(
    () => state?.session?.guests.find((guest) => guest.id === guestId) ?? null,
    [guestId, state?.session?.guests]
  );
  const paymentEntryHref = useMemo(() => {
    const fallbackPath = `/guest/${encodeURIComponent(tableCode)}`;
    const safePathname = pathname ?? fallbackPath;
    const normalizedPath = safePathname.endsWith("/") ? safePathname.slice(0, -1) : safePathname;

    return `${normalizedPath}/payment`;
  }, [pathname, tableCode]);

  useEffect(() => {
    const storedGuestIdentity = readGuestIdentity(tableCode);

    if (storedGuestIdentity?.guestId) {
      setGuestId((current) => current || storedGuestIdentity.guestId);
    }
  }, [tableCode]);

  useEffect(() => {
    if (!state) {
      return;
    }

    if (state.menu.length === 0) {
      if (activeCategoryId) {
        setActiveCategoryId("");
      }

      if (menuItemId) {
        setMenuItemId("");
      }

      return;
    }

    if (!state.menu.some((category) => category.id === activeCategoryId)) {
      setActiveCategoryId(state.menu[0].id);
    }

    if (menuItems.length === 0) {
      if (menuItemId) {
        setMenuItemId("");
      }

      return;
    }

    const existingSelection = menuItems.find((item) => item.id === menuItemId);
    if (existingSelection) {
      if (existingSelection.categoryId !== activeCategoryId) {
        setActiveCategoryId(existingSelection.categoryId);
      }
      return;
    }

    const defaultItem = menuItems.find((item) => item.isAvailable) ?? menuItems[0];
    setMenuItemId(defaultItem.id);
    setActiveCategoryId(defaultItem.categoryId);
  }, [activeCategoryId, menuItemId, menuItems, state]);

  function normalizeQuantity(value: string): string {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) {
      return "1";
    }

    return String(Math.min(20, Math.max(1, parsed)));
  }

  function stepQuantity(delta: number) {
    setQuantity((current) => {
      const parsed = Number.parseInt(current, 10);
      const safe = Number.isNaN(parsed) ? 1 : parsed;
      return normalizeQuantity(String(safe + delta));
    });
  }

  function handleSelectCategory(category: GuestMenuCategory) {
    setActiveCategoryId(category.id);

    if (category.items.some((item) => item.id === menuItemId)) {
      return;
    }

    const defaultInCategory = category.items.find((item) => item.isAvailable) ?? category.items[0];

    if (defaultInCategory) {
      setMenuItemId(defaultInCategory.id);
      setItemNote("");
    }
  }

  function handleSelectItem(item: GuestMenuItem) {
    setMenuItemId(item.id);
    setItemNote("");
  }

  async function load() {
    setLoading(true);
    setError("");

    try {
      const payload = await fetchGuestState(tableCode);
      setState(payload);
      const storedIdentity = readGuestIdentity(tableCode);
      const activeSessionId = payload.session?.id ?? null;

      if (!payload.session) {
        if (guestId || storedIdentity) {
          setGuestId("");
          clearGuestIdentity(tableCode);
        }
        return;
      }

      if (storedIdentity?.sessionId && storedIdentity.sessionId !== payload.session.id) {
        setGuestId("");
        clearGuestIdentity(tableCode);
        return;
      }

      const lookupGuestId = guestId.trim() || storedIdentity?.guestId?.trim() || "";
      let activeGuest = lookupGuestId ? payload.session.guests.find((guest) => guest.id === lookupGuestId) ?? null : null;

      if (!activeGuest && storedIdentity?.guestName) {
        const normalizedStoredName = normalizeGuestName(storedIdentity.guestName);
        const foldedStoredName = foldGuestName(storedIdentity.guestName);

        activeGuest =
          payload.session.guests.find((guest) => normalizeGuestName(guest.displayName) === normalizedStoredName) ??
          payload.session.guests.find((guest) => foldGuestName(guest.displayName) === foldedStoredName) ??
          null;
      }

      if (!activeGuest) {
        if (lookupGuestId || storedIdentity?.guestName) {
          setGuestId("");
          clearGuestIdentity(tableCode);
        }
        return;
      }

      if (guestId !== activeGuest.id) {
        setGuestId(activeGuest.id);
      }

      writeGuestIdentity(tableCode, {
        guestId: activeGuest.id,
        guestName: activeGuest.displayName,
        sessionId: activeSessionId
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load table");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableCode]);

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setOrderSuccess(null);
    setJoining(true);

    try {
      const response = await fetch("/api/sessions/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tableCode,
          displayName: joinName
        })
      });

      const json = (await response.json()) as {
        data?: {
          guest: { id: string; displayName: string };
        };
        error?: string;
      };

      if (!response.ok || !json.data) {
        throw new Error(json.error || "Join failed");
      }

      setGuestId(json.data.guest.id);
      writeGuestIdentity(tableCode, {
        guestId: json.data.guest.id,
        guestName: json.data.guest.displayName,
        sessionId: state?.session?.id ?? null
      });
      setJoinName("");
      setMessage(`Joined as ${json.data.guest.displayName}`);
      await load();
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Join failed");
    } finally {
      setJoining(false);
    }
  }

  async function handleOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setOrderSuccess(null);

    if (!state?.session || !joinedGuest) {
      setError("Join the table first.");
      return;
    }

    if (!selectedMenuItem) {
      setError("Select a menu item first.");
      return;
    }

    if (!selectedMenuItem.isAvailable) {
      setError("Selected item is unavailable.");
      return;
    }

    const normalizedQuantity = Number(normalizeQuantity(quantity));
    const trimmedItemNote = itemNote.trim();
    setOrdering(true);

    try {
      const response = await fetch("/api/orders/customer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: state.session.id,
          guestId: joinedGuest.id,
          items: [
            {
              menuItemId: selectedMenuItem.id,
              quantity: normalizedQuantity,
              note: trimmedItemNote
            }
          ]
        })
      });

      const json = (await response.json()) as {
        data?: {
          id: string;
          items: Array<{
            itemName: string;
            quantity: number;
          }>;
        };
        error?: string;
      };

      if (!response.ok || !json.data) {
        throw new Error(json.error || "Order failed");
      }

      setQuantity("1");
      setItemNote("");
      const firstItem = json.data.items[0];
      const totalQuantity = json.data.items.reduce((sum, item) => sum + item.quantity, 0);

      setMessage(`${formatOrderReference(json.data.id)} sent to kitchen.`);
      if (firstItem) {
        setOrderSuccess({
          orderId: json.data.id,
          itemName: firstItem.itemName,
          quantity: totalQuantity
        });
      }
    } catch (orderError) {
      setError(orderError instanceof Error ? orderError.message : "Order failed");
    } finally {
      setOrdering(false);
    }
  }

  const totalMenuItems = state?.menu.reduce((sum, category) => sum + category.items.length, 0) ?? 0;
  const availableMenuItems =
    state?.menu.reduce((sum, category) => sum + category.items.filter((item) => item.isAvailable).length, 0) ?? 0;

  return (
    <div className="stack-md">
      <section className="panel dashboard-hero stack-md">
        <div className="section-head">
          <div className="dashboard-hero-copy">
            <p className="section-kicker">Table QR</p>
            <h2>{state ? `${state.table.branch.name} - ${state.table.name}` : "Table access"}</h2>
            <p className="panel-subtitle">Join your table, browse the live menu, and send order requests directly from your phone.</p>
          </div>
          <div className="inline">
            <Link href={paymentEntryHref} className="guest-footer-link">
              Payment options
            </Link>
            <button type="button" onClick={load}>
              Refresh
            </button>
          </div>
        </div>

        {state ? (
          <div className="dashboard-stat-grid">
            <article className="dashboard-stat-card">
              <p className="dashboard-stat-label">Table code</p>
              <p className="dashboard-stat-value">{state.table.code}</p>
              <p className="dashboard-stat-note">Use this if staff asks for table verification.</p>
            </article>
            <article className="dashboard-stat-card">
              <p className="dashboard-stat-label">Session</p>
              <p className="dashboard-stat-value">{state.session ? "Open" : "Waiting"}</p>
              <p className="dashboard-stat-note">
                {state.session ? `${state.session.guests.length} guest(s) joined` : "Ask staff to open the table first."}
              </p>
            </article>
            <article className="dashboard-stat-card">
              <p className="dashboard-stat-label">Categories</p>
              <p className="dashboard-stat-value">{state.menu.length}</p>
              <p className="dashboard-stat-note">Menu groups ready to browse.</p>
            </article>
            <article className="dashboard-stat-card">
              <p className="dashboard-stat-label">Available items</p>
              <p className="dashboard-stat-value">{availableMenuItems}</p>
              <p className="dashboard-stat-note">{totalMenuItems} items currently listed for this branch.</p>
            </article>
          </div>
        ) : null}

        <div className="status-stack">
          {loading ? <p className="status-banner is-neutral">Loading your table and menu.</p> : null}
          {error ? <p className="status-banner is-error">{error}</p> : null}
          {message ? <p className="status-banner is-success">{message}</p> : null}
          {orderSuccess ? (
            <p className="status-banner is-success">
              Confirmed: {orderSuccess.itemName} x{orderSuccess.quantity} | Ref {formatOrderReference(orderSuccess.orderId)}
            </p>
          ) : null}
        </div>
      </section>

      {!state?.session ? (
        <section className="panel">
          <div className="section-copy">
            <h3>Session not open yet</h3>
            <p className="panel-subtitle">Ask a waiter to open this table from the waiter dashboard before guests can join or order.</p>
          </div>
        </section>
      ) : (
        <>
          <form className="form-card stack-md" onSubmit={handleJoin}>
            <div className="section-copy">
              <p className="section-kicker">Session</p>
              <h3>Join table</h3>
              <p className="helper-text">Use your name so the kitchen and cashier can track your items correctly.</p>
            </div>

            <div className="badge-row">
              <span className="badge badge-outline">{formatSessionDisplayLabel(state)}</span>
              <span className="badge badge-status-open">{state.session.guests.length} guest(s) joined</span>
              {joinedGuest ? <span className="badge badge-neutral">You: {joinedGuest.displayName}</span> : null}
            </div>

            {joinedGuest ? (
              <div className="selection-summary">
                <p>
                  You are joined as <strong>{joinedGuest.displayName}</strong>
                </p>
              </div>
            ) : (
              <>
                <label>
                  Your name
                  <input
                    value={joinName}
                    onChange={(event) => setJoinName(event.target.value)}
                    placeholder="e.g. Alex"
                    required
                  />
                </label>
                <button type="submit" disabled={joining}>
                  {joining ? "Joining..." : "Join table"}
                </button>
              </>
            )}

            {state.session.guests.length > 0 ? (
              <div className="guest-strip">
                {state.session.guests.map((guest) => (
                  <span key={guest.id} className="guest-chip">
                    {guest.displayName}
                  </span>
                ))}
              </div>
            ) : (
              <p className="helper-text">No one has joined this table yet.</p>
            )}
          </form>

          <form className="form-card stack-md" onSubmit={handleOrder}>
            <div className="section-copy">
              <p className="section-kicker">Menu</p>
              <h3>Browse and order</h3>
              <p className="helper-text">Choose a category, select an item, then send the request to the kitchen.</p>
            </div>

            {state.menu.length === 0 ? <p className="empty empty-state">No menu categories available for this table yet.</p> : null}

            {state.menu.length > 0 ? (
              <>
                <div className="badge-row">
                  <span className="badge badge-outline">{state.menu.length} categories</span>
                  <span className="badge badge-neutral">{availableMenuItems} available item(s)</span>
                  {activeCategory ? <span className="badge badge-status-progress">Viewing {activeCategory.name}</span> : null}
                </div>

                <div className="menu-category-scroller" role="tablist" aria-label="Menu categories">
                  {state.menu.map((category) => {
                    const isActive = activeCategory?.id === category.id;

                    return (
                      <button
                        key={category.id}
                        type="button"
                        className={`menu-category-chip${isActive ? " is-active" : ""}`}
                        onClick={() => handleSelectCategory(category)}
                        aria-pressed={isActive}
                      >
                        <span>{category.name}</span>
                        <span className="menu-category-count">{category.items.length}</span>
                      </button>
                    );
                  })}
                </div>

                {activeCategory ? (
                  <div className="stack-md">
                    <div className="menu-section-head">
                      <p className="helper-text">
                        {activeCategory.items.length} item(s) in {activeCategory.name}.
                      </p>
                    </div>

                    <div className="menu-item-list">
                      {activeCategory.items.length === 0 ? <p className="empty empty-state">No items in this category.</p> : null}
                    {activeCategory.items.map((item) => {
                      const isSelected = item.id === menuItemId;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`menu-item-card${isSelected ? " is-selected" : ""}${item.isAvailable ? "" : " is-unavailable"}`}
                          onClick={() => handleSelectItem(item)}
                          aria-pressed={isSelected}
                        >
                          <div className="menu-item-head">
                            <h4>{item.name}</h4>
                            <span className="menu-item-price">{formatTryCurrency(item.price)}</span>
                          </div>
                          <p className="menu-item-description">{item.description ?? "No description."}</p>
                          <div className="menu-item-meta">
                            <span className={`badge${item.isAvailable ? "" : " badge-unavailable"}`}>
                              {item.isAvailable ? "Available" : "Unavailable"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="menu-order-controls stack-md">
              <div className="selection-summary stack-md">
                <p className="dashboard-stat-label">Selected item</p>
                {selectedMenuItem ? (
                  <>
                    <p>
                      <strong>{selectedMenuItem.name}</strong> - {formatTryCurrency(selectedMenuItem.price)}
                    </p>
                    <div className="badge-row">
                      <span className={`badge${selectedMenuItem.isAvailable ? "" : " badge-unavailable"}`}>
                        {selectedMenuItem.isAvailable ? "Available now" : "Currently unavailable"}
                      </span>
                      {joinedGuest ? <span className="badge badge-neutral">Ordering as {joinedGuest.displayName}</span> : null}
                    </div>
                  </>
                ) : (
                  <p className="meta">Select an item to order.</p>
                )}
                {selectedMenuItem && !selectedMenuItem.isAvailable ? <p className="error">This item is currently unavailable.</p> : null}
              </div>

              <div className="quantity-row">
                <label htmlFor="guest-order-quantity">Quantity</label>
                <div className="quantity-stepper">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => stepQuantity(-1)}
                    disabled={!selectedMenuItem || !selectedMenuItem.isAvailable}
                    aria-label="Decrease quantity"
                  >
                    -
                  </button>
                  <input
                    id="guest-order-quantity"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={20}
                    value={quantity}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (nextValue === "" || /^\d+$/.test(nextValue)) {
                        setQuantity(nextValue);
                      }
                    }}
                    onBlur={() => setQuantity((current) => normalizeQuantity(current))}
                    required
                  />
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => stepQuantity(1)}
                    disabled={!selectedMenuItem || !selectedMenuItem.isAvailable}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </div>

              <label>
                Item note (optional)
                <textarea
                  value={itemNote}
                  onChange={(event) => setItemNote(event.target.value)}
                  placeholder="e.g. no onions, extra spicy"
                  maxLength={300}
                />
              </label>
            </div>

            <button type="submit" disabled={ordering || !joinedGuest || !state.session || !selectedMenuItem || !selectedMenuItem.isAvailable}>
              {ordering ? "Sending..." : "Send order"}
            </button>
            {!joinedGuest ? <p className="meta">Join with your name before ordering.</p> : null}
          </form>
        </>
      )}
    </div>
  );
}
