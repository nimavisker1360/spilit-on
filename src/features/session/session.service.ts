import {
  cloneValue,
  currentTimestamp,
  getOrderItems,
  getSessionGuests,
  getSessionOrders,
  makeId,
  readStore,
  sortByOpenedAtAsc,
  updateStore
} from "@/lib/local-store";
import {
  closeSessionSchema,
  joinSessionSchema,
  openSessionSchema,
  type CloseSessionInput,
  type JoinSessionInput,
  type OpenSessionInput
} from "@/features/session/session.schemas";

function buildSessionWithTableAndGuests(store: ReturnType<typeof readStore>, sessionId: string) {
  const session = store.sessions.find((entry) => entry.id === sessionId);

  if (!session) {
    return null;
  }

  const table = store.tables.find((entry) => entry.id === session.tableId);

  if (!table) {
    return null;
  }

  return {
    ...session,
    table: cloneValue(table),
    guests: cloneValue(getSessionGuests(store, session.id))
  };
}

function buildSessionDetail(store: ReturnType<typeof readStore>, sessionId: string) {
  const session = store.sessions.find((entry) => entry.id === sessionId);

  if (!session) {
    return null;
  }

  const table = store.tables.find((entry) => entry.id === session.tableId);
  const branch = store.branches.find((entry) => entry.id === session.branchId);

  if (!table || !branch) {
    return null;
  }

  return {
    ...session,
    table: cloneValue(table),
    branch: {
      id: branch.id,
      name: branch.name,
      slug: branch.slug
    },
    guests: cloneValue(getSessionGuests(store, session.id))
  };
}

function buildOpenSessionFeed(store: ReturnType<typeof readStore>, sessionId: string) {
  const session = buildSessionDetail(store, sessionId);

  if (!session) {
    return null;
  }

  const guestMap = new Map(session.guests.map((guest) => [guest.id, guest]));

  return {
    ...session,
    orders: getSessionOrders(store, session.id).map((order) => ({
      ...order,
      placedByGuest: order.placedByGuestId
        ? cloneValue(guestMap.get(order.placedByGuestId) ?? null)
        : null,
      items: getOrderItems(store, order.id).map((item) => ({
        ...item,
        guest: cloneValue(guestMap.get(item.guestId) ?? null)
      }))
    }))
  };
}

function normalizeGuestDisplayName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function foldGuestDisplayName(value: string): string {
  return normalizeGuestDisplayName(value).toLocaleLowerCase("tr-TR");
}

export async function openSession(input: OpenSessionInput) {
  const parsed = openSessionSchema.parse(input);

  return updateStore((store) => {
    const table = store.tables.find((entry) => entry.code === parsed.tableCode);

    if (!table || table.status === "OUT_OF_SERVICE") {
      throw new Error("Table is unavailable");
    }

    const existing = store.sessions.find(
      (session) => session.tableId === table.id && session.status === "OPEN"
    );

    if (existing) {
      if (table.status !== "OCCUPIED") {
        table.status = "OCCUPIED";
        table.updatedAt = currentTimestamp();
      }

      return {
        created: false,
        session: cloneValue(buildSessionWithTableAndGuests(store, existing.id))
      };
    }

    const now = currentTimestamp();
    table.status = "OCCUPIED";
    table.updatedAt = now;

    const session = {
      id: makeId("session"),
      branchId: table.branchId,
      tableId: table.id,
      status: "OPEN" as const,
      totalAmount: "0.00",
      paidAmount: "0.00",
      remainingAmount: "0.00",
      openedAt: now,
      closedAt: null,
      readyToCloseAt: null
    };

    store.sessions.push(session);

    return {
      created: true,
      session: cloneValue(buildSessionWithTableAndGuests(store, session.id))
    };
  });
}

export async function joinSession(input: JoinSessionInput) {
  const parsed = joinSessionSchema.parse(input);

  return updateStore((store) => {
    const table = store.tables.find((entry) => entry.code === parsed.tableCode);

    if (!table) {
      throw new Error("Table not found");
    }

    const activeSession = store.sessions.find(
      (session) => session.tableId === table.id && session.status === "OPEN"
    );

    if (!activeSession) {
      throw new Error("No active table session. Ask waiter to open the table.");
    }

    const currentGuests = getSessionGuests(store, activeSession.id);
    const requestedDisplayName = normalizeGuestDisplayName(parsed.displayName);
    const requestedFoldedName = foldGuestDisplayName(requestedDisplayName);
    const reusableGuest = parsed.reuseGuestId
      ? currentGuests.find((guest) => guest.id === parsed.reuseGuestId) ?? null
      : null;

    if (reusableGuest && foldGuestDisplayName(reusableGuest.displayName) === requestedFoldedName) {
      return {
        session: cloneValue(buildSessionDetail(store, activeSession.id)),
        guest: cloneValue(reusableGuest),
        created: false
      };
    }

    const guest = {
      id: makeId("guest"),
      sessionId: activeSession.id,
      displayName: requestedDisplayName,
      joinedAt: currentTimestamp()
    };

    store.guests.push(guest);

    return {
      session: cloneValue(buildSessionDetail(store, activeSession.id)),
      guest: cloneValue(guest),
      created: true
    };
  });
}

export async function closeSession(input: CloseSessionInput) {
  const parsed = closeSessionSchema.parse(input);

  return updateStore((store) => {
    const session = store.sessions.find((entry) => entry.id === parsed.sessionId);

    if (!session) {
      throw new Error("Session not found");
    }

    session.status = "CLOSED";
    session.closedAt = currentTimestamp();

    const table = store.tables.find((entry) => entry.id === session.tableId);

    if (table) {
      table.status = "AVAILABLE";
      table.updatedAt = currentTimestamp();
    }

    return cloneValue(session);
  });
}

export async function getActiveSessionByTableCode(tableCode: string) {
  const store = readStore();
  const table = store.tables.find((entry) => entry.code === tableCode);

  if (!table) {
    return null;
  }

  const activeSession = store.sessions.find(
    (session) => session.tableId === table.id && session.status === "OPEN"
  );

  if (!activeSession) {
    return null;
  }

  return cloneValue(buildSessionDetail(store, activeSession.id));
}

export async function listOpenSessions(branchId?: string) {
  const store = readStore();

  return sortByOpenedAtAsc(
    store.sessions.filter(
      (session) => session.status === "OPEN" && (!branchId || session.branchId === branchId)
    )
  )
    .map((session) => buildOpenSessionFeed(store, session.id))
    .filter((session): session is NonNullable<typeof session> => Boolean(session))
    .map((session) => cloneValue(session));
}
