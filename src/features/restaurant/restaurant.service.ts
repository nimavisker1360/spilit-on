import { normalizeMoneyStorage } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import {
  createBranchSchema,
  deleteBranchSchema,
  updateBranchSchema,
  updateRestaurantSchema,
  type CreateBranchInput,
  type DeleteBranchInput,
  type UpdateBranchInput,
  type UpdateRestaurantInput,
} from "@/features/restaurant/restaurant.schemas";

const STARTER_BRANCH = {
  name: "Main Branch",
  slug: "main-branch",
  location: "Center",
  primaryColor: "#16a34a",
  accentColor: "#bbf7d0",
  fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
} as const;

const STARTER_TABLES = [
  { name: "T1", capacity: 4 },
  { name: "T2", capacity: 4 },
  { name: "T3", capacity: 6 },
] as const;

const STARTER_CATEGORY = {
  name: "Main",
  sortOrder: 1,
} as const;

const STARTER_ITEMS = [
  {
    name: "Cheese Burger",
    description: "Classic burger",
    price: 11.5,
    sortOrder: 1,
    isAvailable: true,
  },
  {
    name: "Cola",
    description: "Cold drink",
    price: 2.8,
    sortOrder: 2,
    isAvailable: true,
  },
] as const;

function toCodeSegment(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function generateStarterTableCode(branchSlug: string, tableName: string): string {
  const base = `${toCodeSegment(branchSlug)}-${toCodeSegment(tableName)}`;
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}-${random}`;
}

const BRANCH_SELECT = {
  id: true,
  restaurantId: true,
  name: true,
  slug: true,
  location: true,
  logoUrl: true,
  coverImageUrl: true,
  primaryColor: true,
  accentColor: true,
  fontFamily: true,
  currency: true,
  localeDefault: true,
  openingHours: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function updateRestaurant(input: UpdateRestaurantInput) {
  const parsed = updateRestaurantSchema.parse(input);

  const existing = await prisma.restaurant.findUnique({ where: { id: parsed.id } });
  if (!existing) throw new Error("Restaurant not found");

  return prisma.restaurant.update({
    where: { id: parsed.id },
    data: { name: parsed.name }
  });
}

export async function createBranch(input: CreateBranchInput) {
  const parsed = createBranchSchema.parse(input);

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: parsed.restaurantId },
  });
  if (!restaurant) throw new Error("Restaurant not found");

  const duplicate = await prisma.branch.findUnique({
    where: { restaurantId_slug: { restaurantId: parsed.restaurantId, slug: parsed.slug } },
  });
  if (duplicate) throw new Error("A branch with this slug already exists in the selected restaurant");

  return prisma.$transaction(async (tx) => {
    const branch = await tx.branch.create({
      data: {
        restaurantId: parsed.restaurantId,
        name: parsed.name,
        slug: parsed.slug,
        location: parsed.location || null,
        logoUrl: parsed.logoUrl || null,
        coverImageUrl: parsed.coverImageUrl || null,
        primaryColor: parsed.primaryColor || "#16a34a",
        accentColor: parsed.accentColor || "#bbf7d0",
        fontFamily: parsed.fontFamily || '"Trebuchet MS", "Segoe UI", sans-serif',
        currency: "TRY",
        localeDefault: "TR",
      },
      select: BRANCH_SELECT,
    });

    await tx.branchSettings.create({
      data: {
        restaurantId: parsed.restaurantId,
        branchId: branch.id,
        taxIncludedInPrices: true,
        defaultTaxRatePercent: 10,
        serviceFeeType: "NONE",
        serviceFeeValue: 0,
        allowCustomerNotes: true,
        allowSplitBill: true,
        allowOnlinePayment: false,
        requireStaffApprovalForQrOrders: false,
        autoAcceptQrOrders: true,
        supportedLocales: ["tr", "en"],
      },
    });

    return branch;
  });
}

export async function updateBranch(input: UpdateBranchInput) {
  const parsed = updateBranchSchema.parse(input);

  const existing = await prisma.branch.findUnique({ where: { id: parsed.id } });
  if (!existing) throw new Error("Branch not found");

  if (existing.slug !== parsed.slug) {
    const duplicate = await prisma.branch.findUnique({
      where: { restaurantId_slug: { restaurantId: existing.restaurantId, slug: parsed.slug } },
    });
    if (duplicate) throw new Error("A branch with this slug already exists in the selected restaurant");
  }

  return prisma.branch.update({
    where: { id: parsed.id },
    data: {
      name: parsed.name,
      slug: parsed.slug,
      location: parsed.location || null,
      logoUrl: parsed.logoUrl || null,
      coverImageUrl: parsed.coverImageUrl || null,
      primaryColor: parsed.primaryColor || "#16a34a",
      accentColor: parsed.accentColor || "#bbf7d0",
      fontFamily: parsed.fontFamily || '"Trebuchet MS", "Segoe UI", sans-serif',
    },
    select: BRANCH_SELECT,
  });
}

export async function deleteBranch(input: DeleteBranchInput) {
  const parsed = deleteBranchSchema.parse(input);

  const existing = await prisma.branch.findUnique({ where: { id: parsed.id } });
  if (!existing) throw new Error("Branch not found");

  const openSessions = await prisma.tableSession.count({
    where: { branchId: parsed.id, status: "OPEN" },
  });
  if (openSessions > 0 && !parsed.force) {
    throw new Error("Close open table sessions before deleting this branch");
  }

  await prisma.$transaction(async (tx) => {
    const sessions = await tx.tableSession.findMany({
      where: { branchId: parsed.id },
      select: { id: true },
    });
    const sessionIds = sessions.map((session) => session.id);

    if (sessionIds.length > 0) {
      const orders = await tx.order.findMany({
        where: { sessionId: { in: sessionIds } },
        select: { id: true },
      });
      const orderIds = orders.map((order) => order.id);

      const invoices = await tx.invoice.findMany({
        where: { sessionId: { in: sessionIds } },
        select: { id: true },
      });
      const invoiceIds = invoices.map((invoice) => invoice.id);

      if (invoiceIds.length > 0) {
        const paymentSessions = await tx.paymentSession.findMany({
          where: { invoiceId: { in: invoiceIds } },
          select: { id: true },
        });
        const paymentSessionIds = paymentSessions.map((ps) => ps.id);

        if (paymentSessionIds.length > 0) {
          const paymentShares = await tx.paymentShare.findMany({
            where: { paymentSessionId: { in: paymentSessionIds } },
            select: { id: true },
          });
          const paymentShareIds = paymentShares.map((share) => share.id);

          if (paymentShareIds.length > 0) {
            await tx.paymentAttempt.deleteMany({ where: { paymentShareId: { in: paymentShareIds } } });
            await tx.paymentShare.deleteMany({ where: { id: { in: paymentShareIds } } });
          }

          await tx.paymentSession.deleteMany({ where: { id: { in: paymentSessionIds } } });
        }

        await tx.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
        await tx.invoiceAssignment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
        await tx.invoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
        await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
      }

      if (orderIds.length > 0) {
        await tx.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
        await tx.order.deleteMany({ where: { id: { in: orderIds } } });
      }

      await tx.guest.deleteMany({ where: { sessionId: { in: sessionIds } } });
      await tx.tableSession.deleteMany({ where: { id: { in: sessionIds } } });
    }

    await tx.menuItem.deleteMany({ where: { branchId: parsed.id } });
    await tx.menuCategory.deleteMany({ where: { branchId: parsed.id } });
    await tx.table.deleteMany({ where: { branchId: parsed.id } });

    await tx.branch.delete({ where: { id: parsed.id } });
  });

  return existing;
}

export async function getAdminSnapshot(scope: { restaurantId?: string; branchIds?: string[] | null } = {}) {
  const restaurants = await prisma.restaurant.findMany({
    where: scope.restaurantId ? { id: scope.restaurantId } : undefined,
    include: {
      branches: {
        where: scope.branchIds ? { id: { in: scope.branchIds } } : undefined,
        include: {
          tables: {
            include: {
              sessions: {
                where: { status: "OPEN" },
                select: { id: true, openedAt: true },
              },
            },
            orderBy: { name: "asc" },
          },
          menuCategories: {
            include: {
              items: {
                orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
              },
            },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          },
          menuItems: {
            include: {
              category: { select: { id: true, name: true } },
            },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          },
        },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return restaurants;
}

export async function getBranchBasicList(restaurantId: string) {
  return prisma.branch.findMany({
    where: { restaurantId },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
}

async function generateStarterPublicToken(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const token = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 24);
    const existing = await prisma.table.findUnique({
      where: { publicToken: token },
      select: { id: true },
    });

    if (!existing) {
      return token;
    }
  }

  throw new Error("Could not generate unique starter table token");
}

async function ensureBranchSettings(branch: { id: string; restaurantId: string }) {
  const existingSettings = await prisma.branchSettings.findUnique({
    where: { branchId: branch.id },
    select: { id: true },
  });

  if (existingSettings) {
    return existingSettings;
  }

  return prisma.branchSettings.create({
    data: {
      restaurantId: branch.restaurantId,
      branchId: branch.id,
      taxIncludedInPrices: true,
      defaultTaxRatePercent: 10,
      serviceFeeType: "NONE",
      serviceFeeValue: 0,
      allowCustomerNotes: true,
      allowSplitBill: true,
      allowOnlinePayment: false,
      requireStaffApprovalForQrOrders: false,
      autoAcceptQrOrders: true,
      supportedLocales: ["tr", "en"],
    },
    select: { id: true },
  });
}

async function ensureStarterTables(branch: { id: string; slug: string }) {
  const tableCount = await prisma.table.count({
    where: { branchId: branch.id },
  });

  if (tableCount > 0) {
    return;
  }

  for (const table of STARTER_TABLES) {
    await prisma.table.create({
      data: {
        branchId: branch.id,
        name: table.name,
        capacity: table.capacity,
        code: generateStarterTableCode(branch.slug, table.name),
        publicToken: await generateStarterPublicToken(),
        status: "AVAILABLE",
      },
    });
  }
}

async function ensureStarterMenu(branchId: string) {
  let category = await prisma.menuCategory.findFirst({
    where: { branchId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  if (!category) {
    category = await prisma.menuCategory.create({
      data: {
        branchId,
        name: STARTER_CATEGORY.name,
        sortOrder: STARTER_CATEGORY.sortOrder,
      },
    });
  }

  const itemCount = await prisma.menuItem.count({
    where: { branchId },
  });

  if (itemCount > 0) {
    return;
  }

  for (const item of STARTER_ITEMS) {
    await prisma.menuItem.create({
      data: {
        branchId,
        categoryId: category.id,
        name: item.name,
        description: item.description,
        imageUrl: null,
        price: normalizeMoneyStorage(item.price),
        isAvailable: item.isAvailable,
        sortOrder: item.sortOrder,
      },
    });
  }
}

export async function ensureRestaurantStarterWorkspace(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true },
  });

  if (!restaurant) {
    throw new Error("Restaurant not found");
  }

  let branch = await prisma.branch.findFirst({
    where: { restaurantId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      restaurantId: true,
      slug: true,
    },
  });

  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        restaurantId,
        name: STARTER_BRANCH.name,
        slug: STARTER_BRANCH.slug,
        location: STARTER_BRANCH.location,
        logoUrl: null,
        coverImageUrl: null,
        primaryColor: STARTER_BRANCH.primaryColor,
        accentColor: STARTER_BRANCH.accentColor,
        fontFamily: STARTER_BRANCH.fontFamily,
        currency: "TRY",
        localeDefault: "TR",
      },
      select: {
        id: true,
        restaurantId: true,
        slug: true,
      },
    });
  }

  await ensureBranchSettings(branch);
  await ensureStarterTables(branch);
  await ensureStarterMenu(branch.id);

  return branch;
}
