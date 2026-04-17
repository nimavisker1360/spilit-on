import {
  cascadeDeleteTable,
  cloneValue,
  currentTimestamp,
  getBranchTables,
  makeId,
  readStore,
  updateStore
} from "@/lib/local-store";
import {
  createTableSchema,
  deleteTableSchema,
  tablePublicTokenSchema,
  updateTableSchema,
  type CreateTableInput,
  type DeleteTableInput,
  type UpdateTableInput
} from "@/features/table/table.schemas";
import { generateUniqueTablePublicToken } from "@/features/table/table-token";

function toCodeSegment(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function generateTableCode(branchSlug: string, tableName: string): string {
  const base = `${toCodeSegment(branchSlug)}-${toCodeSegment(tableName)}`;
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}-${random}`;
}

export async function createTable(input: CreateTableInput) {
  const parsed = createTableSchema.parse(input);

  const publicToken = await generateUniqueTablePublicToken();

  return updateStore((store) => {
    const branch = store.branches.find((entry) => entry.id === parsed.branchId);

    if (!branch) {
      throw new Error("Branch not found");
    }

    const existingInBranch = store.tables.find(
      (table) => table.branchId === parsed.branchId && table.name === parsed.name
    );

    if (existingInBranch) {
      throw new Error(`Table name "${parsed.name}" already exists in this branch`);
    }

    const now = currentTimestamp();
    const table = {
      id: makeId("table"),
      branchId: parsed.branchId,
      name: parsed.name,
      capacity: parsed.capacity,
      code: generateTableCode(branch.slug, parsed.name),
      publicToken,
      status: "AVAILABLE" as const,
      createdAt: now,
      updatedAt: now
    };

    store.tables.push(table);
    branch.updatedAt = now;

    return cloneValue(table);
  });
}

export async function updateTable(input: UpdateTableInput) {
  const parsed = updateTableSchema.parse(input);

  return updateStore((store) => {
    const existing = store.tables.find((table) => table.id === parsed.id);

    if (!existing) {
      throw new Error("Table not found");
    }

    if (existing.name !== parsed.name) {
      const duplicateInBranch = store.tables.find(
        (table) =>
          table.branchId === existing.branchId && table.name === parsed.name && table.id !== parsed.id
      );

      if (duplicateInBranch) {
        throw new Error(`Table name "${parsed.name}" already exists in this branch`);
      }
    }

    existing.name = parsed.name;
    existing.capacity = parsed.capacity;
    existing.status = parsed.status;
    existing.updatedAt = currentTimestamp();

    return cloneValue(existing);
  });
}

export async function deleteTable(input: DeleteTableInput) {
  const parsed = deleteTableSchema.parse(input);

  return updateStore((store) => {
    const existing = store.tables.find((table) => table.id === parsed.id);

    if (!existing) {
      throw new Error("Table not found");
    }

    const openSessionsCount = store.sessions.filter(
      (session) => session.tableId === parsed.id && session.status === "OPEN"
    ).length;

    if (openSessionsCount > 0) {
      throw new Error("Close the active session before deleting this table");
    }

    const deleted = { ...existing };
    cascadeDeleteTable(store, existing.id);

    return cloneValue(deleted);
  });
}

export async function getTableByCode(tableCode: string) {
  const store = readStore();
  const table = store.tables.find((entry) => entry.code === tableCode);

  if (!table) {
    return null;
  }

  const branch = store.branches.find((entry) => entry.id === table.branchId);

  if (!branch) {
    return null;
  }

  return cloneValue({
    ...table,
    branch: {
      id: branch.id,
      name: branch.name,
      slug: branch.slug
    }
  });
}

export async function resolveTableByPublicToken(token: string) {
  const parsedToken = tablePublicTokenSchema.safeParse(token);

  if (!parsedToken.success) {
    return null;
  }

  const store = readStore();
  const table = store.tables.find((entry) => entry.publicToken === parsedToken.data);

  if (!table || table.status === "OUT_OF_SERVICE") {
    return null;
  }

  const branch = store.branches.find((entry) => entry.id === table.branchId);

  if (!branch) {
    return null;
  }

  return cloneValue({
    ...table,
    branch: {
      id: branch.id,
      name: branch.name,
      slug: branch.slug
    }
  });
}

export async function listTablesByBranch(branchId: string) {
  const store = readStore();
  return cloneValue(getBranchTables(store, branchId));
}
