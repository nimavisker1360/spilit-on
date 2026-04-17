import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { KitchenItemStatus, OrderSource, OrderStatus, PaymentStatus, SessionStatus, SplitMode, TableStatus } from "@prisma/client";

type RestaurantRecord = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

type BranchRecord = {
  id: string;
  restaurantId: string;
  name: string;
  slug: string;
  location: string | null;
  createdAt: string;
  updatedAt: string;
};

type TableRecord = {
  id: string;
  branchId: string;
  name: string;
  code: string;
  publicToken: string;
  capacity: number;
  status: TableStatus;
  createdAt: string;
  updatedAt: string;
};

type MenuCategoryRecord = {
  id: string;
  branchId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type MenuItemRecord = {
  id: string;
  branchId: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  price: string;
  isAvailable: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type TableSessionRecord = {
  id: string;
  branchId: string;
  tableId: string;
  status: SessionStatus;
  openedAt: string;
  closedAt: string | null;
};

type GuestRecord = {
  id: string;
  sessionId: string;
  displayName: string;
  joinedAt: string;
};

type OrderRecord = {
  id: string;
  branchId: string;
  sessionId: string;
  source: OrderSource;
  status: OrderStatus;
  placedByGuestId: string | null;
  note: string | null;
  createdAt: string;
};

type OrderItemRecord = {
  id: string;
  orderId: string;
  menuItemId: string;
  itemName: string;
  guestId: string;
  quantity: number;
  unitPrice: string;
  note: string | null;
  status: KitchenItemStatus;
  createdAt: string;
};

type InvoiceRecord = {
  id: string;
  sessionId: string;
  splitMode: SplitMode;
  total: string;
  createdAt: string;
};

type InvoiceLineRecord = {
  id: string;
  invoiceId: string;
  orderItemId: string;
  guestId: string | null;
  amount: string;
  label: string;
};

type InvoiceAssignmentRecord = {
  id: string;
  invoiceId: string;
  guestId: string | null;
  payerLabel: string;
  amount: string;
};

type PaymentRecord = {
  id: string;
  invoiceId: string;
  guestId: string | null;
  amount: string;
  currency: string;
  method: string;
  status: PaymentStatus;
  reference: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LocalStoreData = {
  restaurants: RestaurantRecord[];
  branches: BranchRecord[];
  tables: TableRecord[];
  menuCategories: MenuCategoryRecord[];
  menuItems: MenuItemRecord[];
  sessions: TableSessionRecord[];
  guests: GuestRecord[];
  orders: OrderRecord[];
  orderItems: OrderItemRecord[];
  invoices: InvoiceRecord[];
  invoiceLines: InvoiceLineRecord[];
  invoiceAssignments: InvoiceAssignmentRecord[];
  payments: PaymentRecord[];
};

const DATA_DIRECTORY = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIRECTORY, "local-store.json");

function timestamp(seed = "2026-04-15T09:00:00.000Z") {
  return seed;
}

function defaultStore(): LocalStoreData {
  return {
    restaurants: [
      {
        id: "restaurant_main",
        name: "Main Restaurant",
        slug: "main-restaurant",
        createdAt: timestamp(),
        updatedAt: timestamp()
      }
    ],
    branches: [
      {
        id: "branch_main",
        restaurantId: "restaurant_main",
        name: "Main Branch",
        slug: "main-branch",
        location: "Center",
        createdAt: timestamp(),
        updatedAt: timestamp()
      }
    ],
    tables: [
      {
        id: "table_t1",
        branchId: "branch_main",
        name: "T1",
        code: "MAIN-BRANCH-T1-A1B2",
        publicToken: "main_branch_table_token_01",
        capacity: 4,
        status: TableStatus.AVAILABLE,
        createdAt: timestamp(),
        updatedAt: timestamp()
      },
      {
        id: "table_t2",
        branchId: "branch_main",
        name: "T2",
        code: "MAIN-BRANCH-T2-C3D4",
        publicToken: "main_branch_table_token_02",
        capacity: 4,
        status: TableStatus.AVAILABLE,
        createdAt: timestamp(),
        updatedAt: timestamp()
      },
      {
        id: "table_t3",
        branchId: "branch_main",
        name: "T3",
        code: "MAIN-BRANCH-T3-E5F6",
        publicToken: "main_branch_table_token_03",
        capacity: 6,
        status: TableStatus.AVAILABLE,
        createdAt: timestamp(),
        updatedAt: timestamp()
      }
    ],
    menuCategories: [
      {
        id: "menu_category_main",
        branchId: "branch_main",
        name: "Main",
        sortOrder: 1,
        createdAt: timestamp(),
        updatedAt: timestamp()
      }
    ],
    menuItems: [
      {
        id: "menu_item_burger",
        branchId: "branch_main",
        categoryId: "menu_category_main",
        name: "Cheese Burger",
        description: "Classic burger",
        price: "11.50",
        isAvailable: true,
        sortOrder: 1,
        createdAt: timestamp(),
        updatedAt: timestamp()
      },
      {
        id: "menu_item_cola",
        branchId: "branch_main",
        categoryId: "menu_category_main",
        name: "Cola",
        description: "Cold drink",
        price: "2.80",
        isAvailable: true,
        sortOrder: 2,
        createdAt: timestamp(),
        updatedAt: timestamp()
      }
    ],
    sessions: [],
    guests: [],
    orders: [],
    orderItems: [],
    invoices: [],
    invoiceLines: [],
    invoiceAssignments: [],
    payments: []
  };
}

function ensureStoreFile() {
  mkdirSync(DATA_DIRECTORY, { recursive: true });

  try {
    readFileSync(STORE_FILE, "utf8");
  } catch {
    writeFileSync(STORE_FILE, JSON.stringify(defaultStore(), null, 2), "utf8");
  }
}

export function readStore(): LocalStoreData {
  ensureStoreFile();
  return JSON.parse(readFileSync(STORE_FILE, "utf8")) as LocalStoreData;
}

export function writeStore(store: LocalStoreData) {
  ensureStoreFile();
  writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

export function updateStore<T>(updater: (store: LocalStoreData) => T): T {
  const store = readStore();
  const result = updater(store);
  writeStore(store);
  return result;
}

export function makeId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

export function currentTimestamp(): string {
  return new Date().toISOString();
}

export function sortByNameAsc<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.name.localeCompare(right.name));
}

export function sortByCreatedAtAsc<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

export function sortByJoinedAtAsc<T extends { joinedAt: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => new Date(left.joinedAt).getTime() - new Date(right.joinedAt).getTime());
}

export function sortByOpenedAtAsc<T extends { openedAt: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => new Date(left.openedAt).getTime() - new Date(right.openedAt).getTime());
}

export function sortMenuItems<T extends { sortOrder: number; name: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
}

export function sortMenuCategories<T extends { sortOrder: number; name: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
}

export function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

export function getRestaurantBranches(store: LocalStoreData, restaurantId: string) {
  return sortByNameAsc(store.branches.filter((branch) => branch.restaurantId === restaurantId));
}

export function getBranchTables(store: LocalStoreData, branchId: string) {
  return sortByNameAsc(store.tables.filter((table) => table.branchId === branchId));
}

export function getBranchMenuCategories(store: LocalStoreData, branchId: string) {
  return sortMenuCategories(store.menuCategories.filter((category) => category.branchId === branchId));
}

export function getBranchMenuItems(store: LocalStoreData, branchId: string) {
  return sortMenuItems(store.menuItems.filter((item) => item.branchId === branchId));
}

export function getSessionGuests(store: LocalStoreData, sessionId: string) {
  return sortByJoinedAtAsc(store.guests.filter((guest) => guest.sessionId === sessionId));
}

export function getSessionOrders(store: LocalStoreData, sessionId: string) {
  return sortByCreatedAtAsc(store.orders.filter((order) => order.sessionId === sessionId));
}

export function getOrderItems(store: LocalStoreData, orderId: string) {
  return sortByCreatedAtAsc(store.orderItems.filter((item) => item.orderId === orderId));
}

export function cascadeDeleteSession(store: LocalStoreData, sessionId: string) {
  const orderIds = store.orders.filter((order) => order.sessionId === sessionId).map((order) => order.id);
  const orderItemIds = store.orderItems.filter((item) => orderIds.includes(item.orderId)).map((item) => item.id);
  const invoiceIds = store.invoices.filter((invoice) => invoice.sessionId === sessionId).map((invoice) => invoice.id);

  store.guests = store.guests.filter((guest) => guest.sessionId !== sessionId);
  store.sessions = store.sessions.filter((session) => session.id !== sessionId);
  store.orders = store.orders.filter((order) => order.sessionId !== sessionId);
  store.orderItems = store.orderItems.filter((item) => !orderIds.includes(item.orderId));
  store.invoiceLines = store.invoiceLines.filter(
    (line) => !invoiceIds.includes(line.invoiceId) && !orderItemIds.includes(line.orderItemId)
  );
  store.invoiceAssignments = store.invoiceAssignments.filter((assignment) => !invoiceIds.includes(assignment.invoiceId));
  store.payments = store.payments.filter((payment) => !invoiceIds.includes(payment.invoiceId));
  store.invoices = store.invoices.filter((invoice) => invoice.sessionId !== sessionId);
}

export function cascadeDeleteTable(store: LocalStoreData, tableId: string) {
  const sessionIds = store.sessions.filter((session) => session.tableId === tableId).map((session) => session.id);

  for (const sessionId of sessionIds) {
    cascadeDeleteSession(store, sessionId);
  }

  store.tables = store.tables.filter((table) => table.id !== tableId);
}

export function cascadeDeleteBranch(store: LocalStoreData, branchId: string) {
  const tableIds = store.tables.filter((table) => table.branchId === branchId).map((table) => table.id);
  const categoryIds = store.menuCategories.filter((category) => category.branchId === branchId).map((category) => category.id);
  const sessionIds = store.sessions.filter((session) => session.branchId === branchId).map((session) => session.id);

  for (const sessionId of sessionIds) {
    cascadeDeleteSession(store, sessionId);
  }

  store.tables = store.tables.filter((table) => !tableIds.includes(table.id));
  store.menuItems = store.menuItems.filter((item) => item.branchId !== branchId);
  store.menuCategories = store.menuCategories.filter((category) => category.branchId !== branchId);
  store.branches = store.branches.filter((branch) => branch.id !== branchId);

  if (categoryIds.length > 0) {
    store.menuItems = store.menuItems.filter((item) => !categoryIds.includes(item.categoryId ?? ""));
  }
}
