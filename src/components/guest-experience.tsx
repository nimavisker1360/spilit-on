"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useRealtimeEvents } from "@/hooks/use-realtime-events";
import { formatTryCurrency } from "@/lib/currency";
import { clearGuestIdentity, readGuestIdentity, writeGuestIdentity } from "@/lib/guest-identity";

type GuestMenuItem = {
  id: string;
  name: string;
  price: string;
  description: string | null;
  imageUrl: string | null;
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
      restaurantName: string | null;
      logoUrl: string | null;
      coverImageUrl: string | null;
      primaryColor: string | null;
      accentColor: string | null;
      fontFamily: string | null;
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

type DeviceGuestIdentity = {
  guestId: string;
  guestName: string;
  sessionId: string | null;
};

type GuestOrderStatus = "PENDING" | "IN_PROGRESS" | "READY" | "SERVED" | "VOID";

type GuestOrdersState = {
  table: {
    id: string;
    name: string;
    code: string;
  };
  session: {
    id: string;
    openedAt: string;
  } | null;
  identifiedGuest: {
    id: string;
    displayName: string;
  } | null;
  summary: {
    guestName: string | null;
    itemCount: number;
    subtotal: string;
    unpaidAmount: string | null;
    statusCounts: Record<GuestOrderStatus, number>;
  };
  orders: Array<{
    id: string;
    source: "CUSTOMER" | "WAITER";
    createdAt: string;
    subtotal: string;
    items: Array<{
      id: string;
      itemName: string;
      quantity: number;
      unitPrice: string;
      lineTotal: string;
      note: string | null;
      createdAt: string;
      status: GuestOrderStatus;
    }>;
  }>;
};

const HOST_ROLE_LABEL = "Host";
const GUEST_ROLE_LABEL = "Guest";

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

async function fetchGuestOrders(tableCode: string, payload: { guestId: string; sessionId: string }): Promise<GuestOrdersState> {
  const response = await fetch(`/api/guest/${encodeURIComponent(tableCode)}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    cache: "no-store",
    body: JSON.stringify(payload)
  });
  const json = (await response.json()) as { data?: GuestOrdersState; error?: string };

  if (!response.ok) {
    throw new Error(json.error || "Failed to load orders.");
  }

  if (!json.data) {
    throw new Error("Missing orders payload.");
  }

  return json.data;
}

function formatSessionDisplayLabel(state: GuestState): string {
  return `${state.table.branch.name} \u2022 ${state.table.name} \u2022 Active Session`;
}

function getMenuItemMonogram(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "FD";
}

function itemMatchesSearch(item: GuestMenuItem, query: string): boolean {
  const haystack = `${item.name} ${item.description ?? ""}`.toLocaleLowerCase("tr-TR");
  return haystack.includes(query);
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

function formatGuestOrderStatus(status: GuestOrderStatus): string {
  if (status === "PENDING") {
    return "Order received";
  }

  if (status === "IN_PROGRESS") {
    return "Preparing";
  }

  if (status === "READY") {
    return "Ready";
  }

  if (status === "SERVED") {
    return "Served";
  }

  return "Cancelled";
}

function guestOrderStatusBadgeClass(status: GuestOrderStatus): string {
  if (status === "PENDING") {
    return "badge-status-pending";
  }

  if (status === "IN_PROGRESS") {
    return "badge-status-progress";
  }

  if (status === "READY") {
    return "badge-status-ready";
  }

  return status === "SERVED" ? "badge-status-served" : "badge-danger";
}

function formatOrderCreatedTime(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

type Props = {
  tableCode: string;
};

export function GuestExperience({ tableCode }: Props) {
  const pathname = usePathname();
  const [state, setState] = useState<GuestState | null>(null);
  const [guestId, setGuestId] = useState("");
  const [deviceGuestIdentity, setDeviceGuestIdentity] = useState<DeviceGuestIdentity | null>(null);
  const [joinName, setJoinName] = useState("");
  const [showAddGuestForm, setShowAddGuestForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
  const [myOrders, setMyOrders] = useState<GuestOrdersState | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersRefreshing, setOrdersRefreshing] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [showOrdersSheet, setShowOrdersSheet] = useState(false);
  const ordersRequestRef = useRef(0);

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

  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase("tr-TR");
  const visibleMenu = useMemo(
    () =>
      state?.menu
        .map((category) => {
          if (!normalizedSearchQuery) {
            return category;
          }

          const categoryMatches = category.name.toLocaleLowerCase("tr-TR").includes(normalizedSearchQuery);
          const items = categoryMatches
            ? category.items
            : category.items.filter((item) => itemMatchesSearch(item, normalizedSearchQuery));

          return {
            ...category,
            items
          };
        })
        .filter((category) => category.items.length > 0) ?? [],
    [normalizedSearchQuery, state?.menu]
  );

  const activeVisibleCategory = useMemo(
    () => visibleMenu.find((category) => category.id === activeCategoryId) ?? visibleMenu[0] ?? null,
    [activeCategoryId, visibleMenu]
  );

  const selectedMenuItem = useMemo(() => menuItems.find((item) => item.id === menuItemId) ?? null, [menuItemId, menuItems]);
  const featuredMenuItems = useMemo(() => menuItems.filter((item) => item.isAvailable).slice(0, 4), [menuItems]);
  const heroMenuItem = featuredMenuItems[0] ?? null;
  const joinedGuest = useMemo(
    () => state?.session?.guests.find((guest) => guest.id === guestId) ?? null,
    [guestId, state?.session?.guests]
  );
  const otherJoinedGuests = useMemo(
    () => state?.session?.guests.filter((guest) => guest.id !== joinedGuest?.id) ?? [],
    [joinedGuest?.id, state?.session?.guests]
  );
  const hostGuestId = state?.session?.guests[0]?.id ?? "";
  const getGuestRoleLabel = useCallback(
    (nextGuestId: string | null | undefined) => (nextGuestId && nextGuestId === hostGuestId ? HOST_ROLE_LABEL : GUEST_ROLE_LABEL),
    [hostGuestId]
  );
  const getGuestRoleClassName = useCallback(
    (nextGuestId: string | null | undefined) => `guest-role-pill${nextGuestId && nextGuestId === hostGuestId ? " is-host" : ""}`,
    [hostGuestId]
  );
  const activeSessionId = state?.session?.id ?? "";
  const activeJoinedGuestId = joinedGuest?.id ?? "";
  const shouldShowJoinForm = !joinedGuest || showAddGuestForm;
  const addAnotherGuestAvailable = Boolean(state?.session);
  const paymentEntryHref = useMemo(() => {
    const fallbackPath = `/guest/${encodeURIComponent(tableCode)}`;
    const safePathname = pathname ?? fallbackPath;
    const normalizedPath = safePathname.endsWith("/") ? safePathname.slice(0, -1) : safePathname;

    return `${normalizedPath}/payment`;
  }, [pathname, tableCode]);
  const branchThemeStyle = useMemo<CSSProperties>(
    () => ({
      ["--guest-brand" as string]: state?.table.branch.primaryColor ?? "#16a34a",
      ["--guest-accent" as string]: state?.table.branch.accentColor ?? "#bbf7d0",
      ["--guest-font" as string]: state?.table.branch.fontFamily ?? "\"Trebuchet MS\", \"Segoe UI\", sans-serif"
    }),
    [state?.table.branch.accentColor, state?.table.branch.fontFamily, state?.table.branch.primaryColor]
  );
  const loadGuestOrders = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!activeSessionId || !activeJoinedGuestId) {
        ordersRequestRef.current += 1;
        setMyOrders(null);
        setOrdersLoading(false);
        setOrdersRefreshing(false);
        setOrdersError("");
        return;
      }

      const requestId = ordersRequestRef.current + 1;
      ordersRequestRef.current = requestId;

      if (options?.silent) {
        setOrdersRefreshing(true);
      } else {
        setOrdersLoading(true);
      }
      setOrdersError("");

      try {
        const payload = await fetchGuestOrders(tableCode, {
          guestId: activeJoinedGuestId,
          sessionId: activeSessionId
        });

        if (ordersRequestRef.current !== requestId) {
          return;
        }

        setMyOrders(payload);
      } catch (loadError) {
        if (ordersRequestRef.current !== requestId) {
          return;
        }

        setOrdersError(loadError instanceof Error ? loadError.message : "Failed to load orders.");
      } finally {
        if (ordersRequestRef.current !== requestId) {
          return;
        }

        setOrdersLoading(false);
        setOrdersRefreshing(false);
      }
    },
    [activeJoinedGuestId, activeSessionId, tableCode]
  );

  const clearCurrentGuestBinding = useCallback(() => {
    setGuestId("");
    setDeviceGuestIdentity(null);
    clearGuestIdentity(tableCode);
  }, [tableCode]);

  const persistCurrentGuestBinding = useCallback((nextGuest: { id: string; displayName: string }, sessionId: string | null) => {
    const nextIdentity = {
      guestId: nextGuest.id,
      guestName: nextGuest.displayName,
      sessionId
    };

    setGuestId(nextGuest.id);
    setDeviceGuestIdentity(nextIdentity);
    writeGuestIdentity(tableCode, nextIdentity);
  }, [tableCode]);

  function handleContinueAsCurrentGuest() {
    if (!joinedGuest || !state?.session) {
      return;
    }

    setError("");
    setOrderSuccess(null);
    setJoinName("");
    setShowAddGuestForm(false);
    persistCurrentGuestBinding(joinedGuest, state.session.id);
    setMessage(`Continuing as ${joinedGuest.displayName}`);
  }

  function handleSwitchGuest(nextGuest: { id: string; displayName: string }) {
    if (!state?.session) {
      return;
    }

    setError("");
    setOrderSuccess(null);
    setJoinName("");
    setShowAddGuestForm(false);
    persistCurrentGuestBinding(nextGuest, state.session.id);
    setMessage(`Switched to ${nextGuest.displayName}`);
  }

  useEffect(() => {
    const storedGuestIdentity = readGuestIdentity(tableCode);

    if (storedGuestIdentity?.guestId) {
      setDeviceGuestIdentity({
        guestId: storedGuestIdentity.guestId,
        guestName: storedGuestIdentity.guestName,
        sessionId: storedGuestIdentity.sessionId
      });
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

  function handleFocusMenuItem(item: MenuItemWithCategory) {
    const parentCategory = state?.menu.find((category) => category.id === item.categoryId);

    if (parentCategory) {
      handleSelectCategory(parentCategory);
    }

    handleSelectItem(item);
  }

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError("");

    try {
      const payload = await fetchGuestState(tableCode);
      setState(payload);
      const storedIdentity = readGuestIdentity(tableCode);
      const activeSessionId = payload.session?.id ?? null;

      if (!payload.session) {
        if (guestId || storedIdentity) {
          clearCurrentGuestBinding();
        }
        setShowAddGuestForm(false);
        return;
      }

      if (storedIdentity?.sessionId && storedIdentity.sessionId !== payload.session.id) {
        clearCurrentGuestBinding();
        setShowAddGuestForm(false);
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
          clearCurrentGuestBinding();
        }
        return;
      }

      persistCurrentGuestBinding(activeGuest, activeSessionId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load table");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [clearCurrentGuestBinding, guestId, persistCurrentGuestBinding, tableCode]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const intervalMs = state?.session ? 10000 : 1000;
    const timer = window.setInterval(() => {
      void load({ silent: true });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [load, state?.session]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void load({ silent: true });
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [load]);

  useEffect(() => {
    if (!showOrdersSheet) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowOrdersSheet(false);
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [showOrdersSheet]);

  useEffect(() => {
    if (!activeSessionId || !activeJoinedGuestId) {
      ordersRequestRef.current += 1;
      setMyOrders(null);
      setOrdersLoading(false);
      setOrdersRefreshing(false);
      setOrdersError("");
      return;
    }

    setMyOrders(null);
    void loadGuestOrders();
  }, [activeJoinedGuestId, activeSessionId, loadGuestOrders]);

  useEffect(() => {
    if (!activeSessionId || !activeJoinedGuestId) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadGuestOrders({ silent: true });
    }, 10000);

    return () => window.clearInterval(timer);
  }, [activeJoinedGuestId, activeSessionId, loadGuestOrders]);

  useRealtimeEvents({
    role: "guest",
    onEvent: (event) => {
      if (event.type === "session.opened") {
        if (event.tableCode.trim().toLocaleUpperCase("en-US") === tableCode.trim().toLocaleUpperCase("en-US")) {
          void load({ silent: true });
        }
        return;
      }

      if (!activeSessionId || !activeJoinedGuestId) {
        return;
      }

      if (event.type === "order.created" && event.sessionId !== activeSessionId) {
        return;
      }

      void loadGuestOrders({ silent: true });
    }
  });

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setOrderSuccess(null);
    setJoining(true);

    try {
      const normalizedJoinName = foldGuestName(joinName);
      const reusableGuest =
        deviceGuestIdentity && state?.session
          ? state.session.guests.find((guest) => foldGuestName(guest.displayName) === normalizedJoinName) ?? null
          : null;

      if (reusableGuest && state?.session) {
        persistCurrentGuestBinding(reusableGuest, state.session.id);
        setJoinName("");
        setShowAddGuestForm(false);
        setMessage(`Continuing as ${reusableGuest.displayName}`);
        await load({ silent: true });
        return;
      }

      const response = await fetch("/api/sessions/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tableCode,
          displayName: joinName,
          reuseGuestId: joinedGuest?.id
        })
      });

      const json = (await response.json()) as {
        data?: {
          created: boolean;
          guest: { id: string; displayName: string };
        };
        error?: string;
      };

      if (!response.ok || !json.data) {
        throw new Error(json.error || "Join failed");
      }

      persistCurrentGuestBinding(json.data.guest, state?.session?.id ?? null);
      setJoinName("");
      setShowAddGuestForm(false);
      setMessage(`${json.data.created ? "Joined" : "Continuing"} as ${json.data.guest.displayName}`);
      await load({ silent: true });
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
      setError("Join the table with your name first.");
      return;
    }

    if (!selectedMenuItem) {
      setError("Select an item first.");
      return;
    }

    if (!selectedMenuItem.isAvailable) {
      setError("The selected item is currently unavailable.");
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
      setShowOrdersSheet(true);
      await loadGuestOrders();
    } catch (orderError) {
      setError(orderError instanceof Error ? orderError.message : "Order could not be sent.");
    } finally {
      setOrdering(false);
    }
  }

  const totalMenuItems = state?.menu.reduce((sum, category) => sum + category.items.length, 0) ?? 0;
  const availableMenuItems =
    state?.menu.reduce((sum, category) => sum + category.items.filter((item) => item.isAvailable).length, 0) ?? 0;
  const visibleMenuItems = visibleMenu.reduce((sum, category) => sum + category.items.length, 0);
  const orderStatusSummary = myOrders?.summary.statusCounts ?? {
    PENDING: 0,
    IN_PROGRESS: 0,
    READY: 0,
    SERVED: 0,
    VOID: 0
  };
  const myOrdersButtonMeta = !joinedGuest
    ? "Join the table"
    : ordersError && !myOrders
      ? "Load failed"
    : ordersLoading && !myOrders
      ? "Loading..."
      : myOrders && myOrders.summary.itemCount > 0
        ? `${myOrders.summary.itemCount} items | ${formatTryCurrency(myOrders.summary.subtotal)}`
        : "No orders yet";

  return (
    <div className="guest-menu-app stack-md" style={branchThemeStyle}>
      <section className="guest-menu-hero">
        {state?.table.branch.coverImageUrl ? (
          <div
            className="guest-menu-cover"
            style={{
              backgroundImage: `linear-gradient(180deg, rgba(22, 16, 12, 0.12), rgba(22, 16, 12, 0.82)), url(${state.table.branch.coverImageUrl})`
            }}
          />
        ) : (
          <div className="guest-menu-cover guest-menu-cover--fallback" />
        )}

        <div className="guest-menu-hero-inner">
          <div className="guest-menu-topbar">
            <div className="guest-menu-brand">
              {state?.table.branch.logoUrl ? (
                <img src={state.table.branch.logoUrl} alt={state.table.branch.name} className="guest-menu-brand-logo" />
              ) : (
                <div className="guest-menu-brand-logo guest-menu-brand-logo--fallback">
                  {state ? getMenuItemMonogram(state.table.branch.name) : "QR"}
                </div>
              )}
              <div className="guest-menu-brand-copy">
                <p className="guest-menu-kicker">{state?.table.branch.restaurantName ?? "Restaurant"}</p>
                <h1>{state ? state.table.branch.name : "Guest menu"}</h1>
                <p>{state ? `Table ${state.table.name} • Live ordering from your phone` : "Loading table access"}</p>
              </div>
            </div>

            <div className="guest-menu-actions">
              <Link href={paymentEntryHref} className="guest-menu-action-link">
                My Payment
              </Link>
              <button type="button" className="guest-menu-action-btn" onClick={() => void load()}>
                Refresh
              </button>
            </div>
          </div>

          {state ? (
            <div className="guest-menu-stat-row">
              <article className="guest-menu-stat-card">
                <span className="guest-menu-stat-label">Table code</span>
                <strong>{state.table.code}</strong>
              </article>
              <article className="guest-menu-stat-card">
                <span className="guest-menu-stat-label">Session</span>
                <strong>{state.session ? "Open" : "Waiting"}</strong>
              </article>
              <article className="guest-menu-stat-card">
                <span className="guest-menu-stat-label">Available</span>
                <strong>{availableMenuItems}</strong>
              </article>
            </div>
          ) : null}

          <div className="status-stack">
            {loading ? <p className="status-banner is-neutral">Loading your table and menu.</p> : null}
            {error ? <p className="status-banner is-error">{error}</p> : null}
            {message ? <p className="status-banner is-success">{message}</p> : null}
            {orderSuccess ? (
              <p className="status-banner is-success">
                Sent: {orderSuccess.itemName} x{orderSuccess.quantity} | Ref {formatOrderReference(orderSuccess.orderId)}
              </p>
            ) : null}
          </div>

          <label className="guest-menu-search">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search menu"
              aria-label="Search menu"
            />
          </label>

          {heroMenuItem ? (
            <button type="button" className="guest-spotlight-card" onClick={() => handleFocusMenuItem(heroMenuItem)}>
              <div className="guest-spotlight-copy">
                <p className="guest-menu-kicker">Chef pick</p>
                <h2>{heroMenuItem.name}</h2>
                <p>{heroMenuItem.description ?? "Ready to order from this branch menu."}</p>
                <div className="badge-row">
                  <span className="badge badge-outline">{formatTryCurrency(heroMenuItem.price)}</span>
                  <span className={`badge${heroMenuItem.isAvailable ? "" : " badge-unavailable"}`}>
                    {heroMenuItem.isAvailable ? "Available now" : "Unavailable"}
                  </span>
                </div>
              </div>
              {heroMenuItem.imageUrl ? (
                <img src={heroMenuItem.imageUrl} alt={heroMenuItem.name} className="guest-spotlight-image" />
              ) : (
                <div className="guest-spotlight-image guest-spotlight-image--fallback">{getMenuItemMonogram(heroMenuItem.name)}</div>
              )}
            </button>
          ) : null}

          {featuredMenuItems.length > 0 ? (
            <div className="guest-featured-block">
              <div className="section-copy">
                <p className="guest-menu-kicker">Best sellers</p>
                <h3>Quick picks</h3>
              </div>
              <div className="guest-featured-grid">
                {featuredMenuItems.map((item) => (
                  <button key={item.id} type="button" className="guest-featured-item" onClick={() => handleFocusMenuItem(item)}>
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="guest-featured-thumb" />
                    ) : (
                      <div className="guest-featured-thumb guest-featured-thumb--fallback">{getMenuItemMonogram(item.name)}</div>
                    )}
                    <div className="guest-featured-body">
                      <strong>{item.name}</strong>
                      <span>{formatTryCurrency(item.price)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="menu-category-scroller" role="tablist" aria-label="Menu categories">
            {visibleMenu.map((category) => {
              const isActive = activeVisibleCategory?.id === category.id;

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
        </div>
      </section>

      {!state?.session ? (
        <section className="panel guest-menu-panel">
          <div className="section-copy">
            <h3>Session not open yet</h3>
            <p className="panel-subtitle">Ask a waiter to open this table before guests can join or send orders.</p>
          </div>
        </section>
      ) : (
        <>
          <form className="guest-menu-panel guest-join-card stack-md" onSubmit={handleJoin}>
            <div className="section-copy">
              <p className="guest-menu-kicker">Session</p>
              <h3>Join table</h3>
              <p className="helper-text">Use your name so kitchen and cashier flows stay tied to the right guest.</p>
            </div>

            <div className="badge-row">
              <span className="badge badge-outline">{formatSessionDisplayLabel(state)}</span>
              <span className="badge badge-status-open">{state.session.guests.length} guest(s) joined</span>
              {joinedGuest ? (
                <span className="badge badge-neutral">
                  You: {joinedGuest.displayName} - {getGuestRoleLabel(joinedGuest.id)}
                </span>
              ) : null}
            </div>

            {joinedGuest ? (
              <div className="selection-summary stack-md">
                <p>
                  Current guest on this device: <strong>{joinedGuest.displayName}</strong>
                </p>
                <div className="ticket-actions">
                  <button type="button" className="secondary" onClick={handleContinueAsCurrentGuest}>
                    Continue as {joinedGuest.displayName}
                  </button>
                  <button type="button" onClick={() => setShowAddGuestForm(true)} disabled={!addAnotherGuestAvailable}>
                    Add another guest
                  </button>
                </div>
                {otherJoinedGuests.length > 0 ? (
                  <div className="stack-md">
                    <p className="helper-text">Switch this device to another joined guest if needed.</p>
                    <div className="guest-selector-list">
                      {otherJoinedGuests.map((guest) => (
                        <button
                          key={guest.id}
                          type="button"
                          className="guest-selector-btn"
                          onClick={() => handleSwitchGuest(guest)}
                        >
                          <span className="guest-selector-name">{guest.displayName}</span>
                          <span className="guest-selector-meta">
                            {getGuestRoleLabel(guest.id)} - Switch this device to {guest.displayName}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {shouldShowJoinForm ? (
              <>
                <label>
                  {joinedGuest ? "Another guest name" : "Your name"}
                  <input
                    value={joinName}
                    onChange={(event) => setJoinName(event.target.value)}
                    placeholder="e.g. Alex"
                    required
                  />
                </label>
                <div className="ticket-actions">
                  <button type="submit" disabled={joining}>
                    {joining ? "Joining..." : joinedGuest ? "Add guest to table" : "Join table"}
                  </button>
                  {joinedGuest ? (
                    <button type="button" className="secondary" onClick={handleContinueAsCurrentGuest}>
                      Continue as {joinedGuest.displayName}
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}

            {state.session.guests.length > 0 ? (
              <div className="guest-strip">
                {state.session.guests.map((guest) => (
                  <span key={guest.id} className="guest-chip">
                    <span>{guest.displayName}</span>
                    <span className={getGuestRoleClassName(guest.id)}>{getGuestRoleLabel(guest.id)}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="helper-text">No one has joined this table yet.</p>
            )}
          </form>

          <section className="guest-menu-panel stack-md">
            <div className="section-copy">
              <p className="guest-menu-kicker">Menu</p>
              <h3>{activeVisibleCategory ? activeVisibleCategory.name : "Browse menu"}</h3>
              <p className="helper-text">
                {normalizedSearchQuery
                  ? `${visibleMenuItems} result(s) matching "${searchQuery.trim()}".`
                  : `${state.menu.length} categories and ${totalMenuItems} items available for this branch.`}
              </p>
            </div>

            {state.menu.length === 0 ? <p className="empty empty-state">No menu categories available for this table yet.</p> : null}
            {state.menu.length > 0 && visibleMenu.length === 0 ? (
              <p className="empty empty-state">No items matched your search. Try another keyword.</p>
            ) : null}

            {activeVisibleCategory ? (
              <div className="guest-menu-list">
                {activeVisibleCategory.items.map((item) => {
                  const isSelected = item.id === menuItemId;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`guest-menu-row${isSelected ? " is-selected" : ""}${item.isAvailable ? "" : " is-unavailable"}`}
                      onClick={() => handleSelectItem(item)}
                      aria-pressed={isSelected}
                    >
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="guest-menu-row-image" />
                      ) : (
                        <div className="guest-menu-row-image guest-menu-row-image--fallback">{getMenuItemMonogram(item.name)}</div>
                      )}
                      <div className="guest-menu-row-copy">
                        <div className="guest-menu-row-head">
                          <h4>{item.name}</h4>
                          <span className="menu-item-price">{formatTryCurrency(item.price)}</span>
                        </div>
                        <p className="menu-item-description">{item.description ?? "No description."}</p>
                        <div className="menu-item-meta">
                          <span className={`badge${item.isAvailable ? "" : " badge-unavailable"}`}>
                            {item.isAvailable ? "Available" : "Unavailable"}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>

          <form className="guest-menu-panel guest-order-sheet stack-md" onSubmit={handleOrder}>
            <div className="section-copy">
              <p className="guest-menu-kicker">Order</p>
              <h3>Finish and send</h3>
            </div>

            <div className="guest-order-summary">
              {selectedMenuItem ? (
                <>
                  {selectedMenuItem.imageUrl ? (
                    <img src={selectedMenuItem.imageUrl} alt={selectedMenuItem.name} className="guest-order-summary-image" />
                  ) : (
                    <div className="guest-order-summary-image guest-order-summary-image--fallback">
                      {getMenuItemMonogram(selectedMenuItem.name)}
                    </div>
                  )}
                  <div className="guest-order-summary-copy">
                    <p className="dashboard-stat-label">Selected item</p>
                    <h4>{selectedMenuItem.name}</h4>
                    <p>{formatTryCurrency(selectedMenuItem.price)}</p>
                    <div className="badge-row">
                      <span className={`badge${selectedMenuItem.isAvailable ? "" : " badge-unavailable"}`}>
                        {selectedMenuItem.isAvailable ? "Available now" : "Currently unavailable"}
                      </span>
                      {joinedGuest ? <span className="badge badge-neutral">Ordering as {joinedGuest.displayName}</span> : null}
                    </div>
                  </div>
                </>
              ) : (
                <p className="meta">Select an item to order.</p>
              )}
            </div>

            {selectedMenuItem && !selectedMenuItem.isAvailable ? <p className="error">This item is currently unavailable.</p> : null}

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

            <button
              type="submit"
              disabled={ordering || !joinedGuest || !state.session || !selectedMenuItem || !selectedMenuItem.isAvailable}
            >
              {ordering ? "Sending..." : "Send order"}
            </button>
            {!joinedGuest ? <p className="meta">Join with your name before ordering.</p> : null}
          </form>
        </>
      )}

      {state?.session ? (
        <div className="guest-mobile-actions">
          <button type="button" className="guest-mobile-action" onClick={() => setShowOrdersSheet(true)}>
            <span className="guest-mobile-action-label">My Orders</span>
            <span className="guest-mobile-action-meta">{myOrdersButtonMeta}</span>
          </button>
          <Link href={paymentEntryHref} className="guest-mobile-action guest-mobile-action--link">
            <span className="guest-mobile-action-label">My Payment</span>
            <span className="guest-mobile-action-meta">
              {myOrders && myOrders.summary.unpaidAmount !== null
                ? formatTryCurrency(myOrders.summary.unpaidAmount)
                : "View my share"}
            </span>
          </Link>
        </div>
      ) : null}

      {showOrdersSheet ? (
        <div className="guest-orders-sheet-backdrop" onClick={() => setShowOrdersSheet(false)}>
          <section
            className="guest-orders-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="My Orders"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="guest-orders-sheet-handle" />

            <div className="guest-orders-sheet-head">
              <div className="section-copy">
                <p className="guest-menu-kicker">My Orders</p>
                <h3>{joinedGuest ? joinedGuest.displayName : "Guest mapping required"}</h3>
                <p className="helper-text">
                  {joinedGuest
                    ? "Only orders for the guest mapped on this device are shown."
                    : "After joining the table with your name, your orders will appear here."}
                </p>
              </div>

              <div className="inline">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void loadGuestOrders({ silent: true })}
                  disabled={!joinedGuest || ordersRefreshing}
                >
                  {ordersRefreshing ? "Refreshing..." : "Refresh"}
                </button>
                <button type="button" className="secondary" onClick={() => setShowOrdersSheet(false)}>
                  Close
                </button>
              </div>
            </div>

            <div className="guest-orders-sheet-body stack-md">
              {ordersLoading && !myOrders ? <p className="status-banner is-neutral">Loading your orders.</p> : null}
              {ordersError ? <p className="status-banner is-error">{ordersError}</p> : null}
              {ordersRefreshing && myOrders ? <p className="status-banner is-neutral">Refreshing statuses.</p> : null}

              {!joinedGuest ? (
                <div className="selection-summary stack-md">
                  <p>
                    <strong>Guest mapping is required.</strong>
                  </p>
                  <p className="helper-text">
                    After joining the table with your name, your orders will appear here.
                  </p>
                </div>
              ) : myOrders && myOrders.orders.length > 0 ? (
                <>
                  <div className="dashboard-stat-grid guest-orders-summary-grid">
                    <article className="dashboard-stat-card">
                      <p className="dashboard-stat-label">Guest</p>
                      <p className="dashboard-stat-value guest-orders-stat-value">{myOrders.identifiedGuest?.displayName ?? "-"}</p>
                    </article>
                    <article className="dashboard-stat-card">
                      <p className="dashboard-stat-label">Total items</p>
                      <p className="dashboard-stat-value">{myOrders.summary.itemCount}</p>
                    </article>
                    <article className="dashboard-stat-card">
                      <p className="dashboard-stat-label">Subtotal</p>
                      <p className="dashboard-stat-value">{formatTryCurrency(myOrders.summary.subtotal)}</p>
                    </article>
                    <article className="dashboard-stat-card">
                      <p className="dashboard-stat-label">Unpaid</p>
                      <p className="dashboard-stat-value">
                        {myOrders.summary.unpaidAmount !== null ? formatTryCurrency(myOrders.summary.unpaidAmount) : "-"}
                      </p>
                    </article>
                  </div>

                  <div className="selection-summary stack-md">
                    <div className="section-copy">
                      <h4>Order summary</h4>
                      <p className="helper-text">Statuses are calculated only from your own items.</p>
                    </div>
                    <div className="badge-row">
                      <span className="badge badge-status-pending">Pending {orderStatusSummary.PENDING}</span>
                      <span className="badge badge-status-progress">Preparing {orderStatusSummary.IN_PROGRESS}</span>
                      <span className="badge badge-status-ready">Ready {orderStatusSummary.READY}</span>
                      <span className="badge badge-status-served">Served {orderStatusSummary.SERVED}</span>
                    </div>
                  </div>

                  <div className="guest-orders-list">
                    {myOrders.orders.map((order) => (
                      <article key={order.id} className="guest-menu-panel guest-order-history-card stack-md">
                        <div className="guest-order-history-head">
                          <div className="section-copy">
                            <h4>{formatOrderReference(order.id)}</h4>
                            <p className="helper-text">Submitted: {formatOrderCreatedTime(order.createdAt)}</p>
                          </div>
                          <div className="badge-row">
                            <span className={`badge ${order.source === "CUSTOMER" ? "badge-source-customer" : "badge-source-waiter"}`}>
                              {order.source === "CUSTOMER" ? "QR order" : "Staff order"}
                            </span>
                            <span className="badge badge-outline">{formatTryCurrency(order.subtotal)}</span>
                          </div>
                        </div>

                        <div className="guest-order-item-list">
                          {order.items.map((item) => (
                            <article key={item.id} className="guest-order-item-card">
                              <div className="guest-order-item-head">
                                <div className="section-copy">
                                  <h4>{item.itemName}</h4>
                                  <p className="helper-text">
                                    Qty {item.quantity} x {formatTryCurrency(item.unitPrice)}
                                  </p>
                                </div>
                                <strong>{formatTryCurrency(item.lineTotal)}</strong>
                              </div>

                              <div className="badge-row">
                                <span className={`badge ${guestOrderStatusBadgeClass(item.status)}`}>
                                  {formatGuestOrderStatus(item.status)}
                                </span>
                                <span className="badge badge-outline">{formatOrderCreatedTime(item.createdAt)}</span>
                              </div>

                              {item.note ? (
                                <p className="meta">
                                  <strong>Note:</strong> {item.note}
                                </p>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              ) : myOrders && joinedGuest && !ordersLoading ? (
                <div className="selection-summary stack-md">
                  <p>
                    <strong>You do not have any orders yet.</strong>
                  </p>
                  <p className="helper-text">Select items from the menu to place your first order.</p>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

    </div>
  );
}
