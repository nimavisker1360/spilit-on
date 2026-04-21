import { prisma } from "@/lib/prisma";
import {
  closeSessionSchema,
  joinSessionSchema,
  openSessionSchema,
  type CloseSessionInput,
  type JoinSessionInput,
  type OpenSessionInput,
} from "@/features/session/session.schemas";

function normalizeGuestName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function foldName(value: string): string {
  return normalizeGuestName(value).toLocaleLowerCase("tr-TR");
}

const SESSION_WITH_TABLE_AND_GUESTS = {
  table: true,
  guests: true,
} as const;

const SESSION_DETAIL = {
  table: true,
  branch: { select: { id: true, name: true, slug: true } },
  guests: true,
} as const;

export async function openSession(input: OpenSessionInput) {
  const parsed = openSessionSchema.parse(input);

  const table = await prisma.table.findUnique({ where: { code: parsed.tableCode } });
  if (!table || table.status === "OUT_OF_SERVICE") throw new Error("Table is unavailable");

  const existing = await prisma.tableSession.findFirst({
    where: { tableId: table.id, status: "OPEN" },
    include: SESSION_WITH_TABLE_AND_GUESTS,
  });

  if (existing) {
    if (table.status !== "OCCUPIED") {
      await prisma.table.update({ where: { id: table.id }, data: { status: "OCCUPIED" } });
    }
    return { created: false, session: existing };
  }

  const [session] = await prisma.$transaction([
    prisma.tableSession.create({
      data: {
        branchId: table.branchId,
        tableId: table.id,
        status: "OPEN",
        totalAmount: 0,
        paidAmount: 0,
        remainingAmount: 0,
      },
      include: SESSION_WITH_TABLE_AND_GUESTS,
    }),
    prisma.table.update({ where: { id: table.id }, data: { status: "OCCUPIED" } }),
  ]);

  return { created: true, session };
}

export async function joinSession(input: JoinSessionInput) {
  const parsed = joinSessionSchema.parse(input);

  const table = await prisma.table.findUnique({ where: { code: parsed.tableCode } });
  if (!table) throw new Error("Table not found");

  const activeSession = await prisma.tableSession.findFirst({
    where: { tableId: table.id, status: "OPEN" },
    include: SESSION_DETAIL,
  });

  if (!activeSession) throw new Error("No active table session. Ask waiter to open the table.");

  const requestedName = normalizeGuestName(parsed.displayName);
  const requestedFolded = foldName(requestedName);

  if (parsed.reuseGuestId) {
    const existing = await prisma.guest.findFirst({
      where: { id: parsed.reuseGuestId, sessionId: activeSession.id },
    });
    if (existing && foldName(existing.displayName) === requestedFolded) {
      return { session: activeSession, guest: existing, created: false };
    }
  }

  const guest = await prisma.guest.create({
    data: { sessionId: activeSession.id, displayName: requestedName },
  });

  return { session: activeSession, guest, created: true };
}

export async function closeSession(input: CloseSessionInput) {
  const parsed = closeSessionSchema.parse(input);

  const session = await prisma.tableSession.findUnique({ where: { id: parsed.sessionId } });
  if (!session) throw new Error("Session not found");

  const [updated] = await prisma.$transaction([
    prisma.tableSession.update({
      where: { id: parsed.sessionId },
      data: { status: "CLOSED", closedAt: new Date() },
    }),
    prisma.table.update({
      where: { id: session.tableId },
      data: { status: "AVAILABLE" },
    }),
  ]);

  return updated;
}

export async function getActiveSessionByTableCode(tableCode: string) {
  const table = await prisma.table.findUnique({ where: { code: tableCode } });
  if (!table) return null;

  return prisma.tableSession.findFirst({
    where: { tableId: table.id, status: "OPEN" },
    include: SESSION_DETAIL,
  });
}

export async function listOpenSessions(branchId?: string, branchIds?: string[] | null) {
  return prisma.tableSession.findMany({
    where: {
      status: "OPEN",
      ...(branchId ? { branchId } : {}),
      ...(branchIds ? { branchId: { in: branchIds } } : {}),
    },
    include: {
      table: true,
      branch: { select: { id: true, name: true } },
      guests: true,
      orders: {
        include: {
          placedByGuest: true,
          items: {
            where: { status: { not: "VOID" } },
            include: { guest: true },
          },
        },
      },
    },
    orderBy: { openedAt: "asc" },
  });
}
