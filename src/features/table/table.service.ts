import { prisma } from "@/lib/prisma";
import {
  createTableSchema,
  deleteTableSchema,
  tablePublicTokenSchema,
  updateTableSchema,
  type CreateTableInput,
  type DeleteTableInput,
  type UpdateTableInput,
} from "@/features/table/table.schemas";

function toCodeSegment(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function generateTableCode(branchSlug: string, tableName: string): string {
  const base = `${toCodeSegment(branchSlug)}-${toCodeSegment(tableName)}`;
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}-${random}`;
}

async function generateUniquePublicToken(): Promise<string> {
  const { randomBytes } = await import("crypto");
  for (let i = 0; i < 10; i++) {
    const token = randomBytes(16).toString("hex");
    const exists = await prisma.table.findUnique({ where: { publicToken: token } });
    if (!exists) return token;
  }
  throw new Error("Could not generate unique table token");
}

export async function createTable(input: CreateTableInput) {
  const parsed = createTableSchema.parse(input);

  const branch = await prisma.branch.findUnique({ where: { id: parsed.branchId } });
  if (!branch) throw new Error("Branch not found");

  const existing = await prisma.table.findUnique({
    where: { branchId_name: { branchId: parsed.branchId, name: parsed.name } },
  });
  if (existing) throw new Error(`Table name "${parsed.name}" already exists in this branch`);

  const publicToken = await generateUniquePublicToken();

  return prisma.table.create({
    data: {
      branchId: parsed.branchId,
      name: parsed.name,
      capacity: parsed.capacity,
      code: generateTableCode(branch.slug, parsed.name),
      publicToken,
      status: "AVAILABLE",
    },
  });
}

export async function updateTable(input: UpdateTableInput) {
  const parsed = updateTableSchema.parse(input);

  const existing = await prisma.table.findUnique({ where: { id: parsed.id } });
  if (!existing) throw new Error("Table not found");

  if (existing.name !== parsed.name) {
    const duplicate = await prisma.table.findUnique({
      where: { branchId_name: { branchId: existing.branchId, name: parsed.name } },
    });
    if (duplicate) throw new Error(`Table name "${parsed.name}" already exists in this branch`);
  }

  return prisma.table.update({
    where: { id: parsed.id },
    data: { name: parsed.name, capacity: parsed.capacity, status: parsed.status },
  });
}

export async function deleteTable(input: DeleteTableInput) {
  const parsed = deleteTableSchema.parse(input);

  const existing = await prisma.table.findUnique({ where: { id: parsed.id } });
  if (!existing) throw new Error("Table not found");

  const openSessions = await prisma.tableSession.count({
    where: { tableId: parsed.id, status: "OPEN" },
  });
  if (openSessions > 0 && !parsed.force) {
    throw new Error("Close the active session before deleting this table");
  }

  await prisma.table.delete({ where: { id: parsed.id } });
  return existing;
}

export async function getTableByCode(tableCode: string) {
  const table = await prisma.table.findUnique({
    where: { code: tableCode },
    include: {
      branch: {
        include: { restaurant: { select: { name: true } } },
      },
    },
  });
  if (!table) return null;

  return {
    ...table,
    branch: {
      id: table.branch.id,
      name: table.branch.name,
      slug: table.branch.slug,
      restaurantName: table.branch.restaurant?.name ?? null,
      logoUrl: table.branch.logoUrl,
      coverImageUrl: table.branch.coverImageUrl,
      primaryColor: table.branch.primaryColor,
      accentColor: table.branch.accentColor,
      fontFamily: table.branch.fontFamily,
    },
  };
}

export async function resolveTableByPublicToken(token: string) {
  const parsedToken = tablePublicTokenSchema.safeParse(token);
  if (!parsedToken.success) return null;

  const table = await prisma.table.findUnique({
    where: { publicToken: parsedToken.data },
    include: {
      branch: {
        include: { restaurant: { select: { name: true } } },
      },
    },
  });

  if (!table || table.status === "OUT_OF_SERVICE") return null;

  return {
    ...table,
    branch: {
      id: table.branch.id,
      name: table.branch.name,
      slug: table.branch.slug,
      restaurantName: table.branch.restaurant?.name ?? null,
      logoUrl: table.branch.logoUrl,
      coverImageUrl: table.branch.coverImageUrl,
      primaryColor: table.branch.primaryColor,
      accentColor: table.branch.accentColor,
      fontFamily: table.branch.fontFamily,
    },
  };
}

export async function listTablesByBranch(branchId: string) {
  return prisma.table.findMany({
    where: { branchId },
    orderBy: { name: "asc" },
  });
}
