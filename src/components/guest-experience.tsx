"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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

type Props = {
  tableCode: string;
};

export function GuestExperience({ tableCode }: Props) {
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

      if (guestId) {
        const activeGuest = payload.session?.guests.find((guest) => guest.id === guestId);
        if (!activeGuest) {
          setGuestId("");
        }
      }
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

      setMessage(`Order #${json.data.id.slice(0, 8)} sent to kitchen.`);
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

  return (
    <div className="stack-md">
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Table access</h2>
            <p className="meta">Opened from your table QR link.</p>
          </div>
          <button type="button" onClick={load}>
            Refresh
          </button>
        </div>

        {loading ? <p className="meta">Loading table...</p> : null}
        {state ? (
          <p>
            <strong>
              {state.table.branch.name} - {state.table.name}
            </strong>
          </p>
        ) : null}

        {error ? <p className="error">{error}</p> : null}
        {message ? <p className="success">{message}</p> : null}
      </section>

      {!state?.session ? (
        <section className="panel">
          <h3>Session not open yet</h3>
          <p className="meta">Ask a waiter to open this table from the waiter dashboard.</p>
        </section>
      ) : (
        <>
          <form className="form-card stack-md" onSubmit={handleJoin}>
            <h3>Join table</h3>
            <p className="meta">Session: {state.session.id.slice(0, 8)}</p>

            {joinedGuest ? (
              <p>
                You are joined as <strong>{joinedGuest.displayName}</strong>
              </p>
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

            <p className="meta">
              Current guests: {state.session.guests.length > 0 ? state.session.guests.map((guest) => guest.displayName).join(", ") : "none"}
            </p>
          </form>

          <form className="form-card stack-md" onSubmit={handleOrder}>
            <h3>Browse menu</h3>

            {state.menu.length === 0 ? <p className="empty">No menu categories available.</p> : null}

            {state.menu.length > 0 ? (
              <>
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
                  <div className="menu-item-list">
                    {activeCategory.items.length === 0 ? <p className="empty">No items in this category.</p> : null}
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
                            <span className="menu-item-price">${Number(item.price).toFixed(2)}</span>
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
                ) : null}
              </>
            ) : null}

            <div className="menu-order-controls stack-md">
              <div>
                <p className="meta">Selected item</p>
                {selectedMenuItem ? (
                  <p>
                    <strong>{selectedMenuItem.name}</strong> - ${Number(selectedMenuItem.price).toFixed(2)}
                  </p>
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
            {orderSuccess ? (
              <p className="success">
                Confirmed: {orderSuccess.itemName} x{orderSuccess.quantity} | Ref: {orderSuccess.orderId.slice(0, 8)}
              </p>
            ) : null}
          </form>
        </>
      )}
    </div>
  );
}
