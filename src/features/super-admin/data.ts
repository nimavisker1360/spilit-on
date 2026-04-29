import { addDays, addMonths, subDays } from "@/features/super-admin/date";
import { getProPlanFeaturePayload, PRO_PLAN_CODE, PRO_PLAN_PRICE_MONTHLY, TRIAL_DURATION_DAYS } from "@/features/billing/plan-config";
import { prisma } from "@/lib/prisma";

export const PLATFORM_SETTINGS_KEY = "platform";

export type PlatformSettings = {
  supportEmail: string;
  companyName: string;
  iyzicoMode: "test" | "live";
  defaultCurrency: string;
  trialDurationDays: number;
  trialEnabled: boolean;
  maintenanceMode: boolean;
};

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  supportEmail: "support@masapayz.com",
  companyName: "MasaPayz",
  iyzicoMode: "test",
  defaultCurrency: "TRY",
  trialDurationDays: TRIAL_DURATION_DAYS,
  trialEnabled: true,
  maintenanceMode: false,
};

export function formatMoney(value: unknown): string {
  if (value === null || value === undefined) return "0.00";
  if (typeof value === "number") return value.toFixed(2);
  if (typeof value === "string") return value;
  if (typeof value === "object" && "toString" in value) return value.toString();
  return "0.00";
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const row = await prisma.platformSetting.findUnique({
    where: { key: PLATFORM_SETTINGS_KEY },
  });

  if (!row || typeof row.value !== "object" || row.value === null || Array.isArray(row.value)) {
    return DEFAULT_PLATFORM_SETTINGS;
  }

  return {
    ...DEFAULT_PLATFORM_SETTINGS,
    ...(row.value as Partial<PlatformSettings>),
  };
}

export async function savePlatformSettings(settings: PlatformSettings) {
  return prisma.platformSetting.upsert({
    where: { key: PLATFORM_SETTINGS_KEY },
    update: { value: settings },
    create: { key: PLATFORM_SETTINGS_KEY, value: settings },
  });
}

export async function ensureProPlan() {
  return prisma.subscriptionPlan.upsert({
    where: { code: PRO_PLAN_CODE },
    update: {
      name: "Pro",
      currency: "TRY",
      features: getProPlanFeaturePayload(),
    },
    create: {
      code: PRO_PLAN_CODE,
      name: "Pro",
      monthlyPrice: PRO_PLAN_PRICE_MONTHLY,
      annualPrice: "0.00",
      currency: "TRY",
      includedTables: 30,
      includedBranches: 1,
      includedStaff: 10,
      commissionRate: "0.00",
      features: getProPlanFeaturePayload(),
      isActive: true,
    },
  });
}

export async function getRestaurantOwner(restaurantId: string) {
  return prisma.membership.findFirst({
    where: { restaurantId, role: "OWNER" },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function getSuperAdminDashboard() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [
    totalUsers,
    totalRestaurants,
    trialRestaurants,
    activeProSubscriptions,
    expiredTrials,
    monthlyRevenue,
    totalRevenue,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.restaurant.count(),
    prisma.restaurant.count({ where: { status: "TRIALING" } }),
    prisma.tenantSubscription.count({
      where: { status: "ACTIVE", plan: { code: PRO_PLAN_CODE } },
    }),
    prisma.restaurant.count({
      where: {
        status: "TRIALING",
        trialEndsAt: { lt: now },
      },
    }),
    prisma.platformPayment.aggregate({
      where: {
        status: "SUCCEEDED",
        succeededAt: { gte: monthStart },
      },
      _sum: { amount: true },
    }),
    prisma.platformPayment.aggregate({
      where: { status: "SUCCEEDED" },
      _sum: { amount: true },
    }),
  ]);

  return {
    totalUsers,
    totalRestaurants,
    trialRestaurants,
    activeProSubscriptions,
    expiredTrials,
    monthlyRevenue: formatMoney(monthlyRevenue._sum.amount),
    totalRevenue: formatMoney(totalRevenue._sum.amount),
  };
}

export async function listSuperAdminUsers() {
  const users = await prisma.user.findMany({
    include: {
      memberships: {
        include: {
          restaurant: {
            include: {
              subscriptions: {
                include: { plan: true },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return users.map((user) => {
    const primaryMembership = user.memberships[0] ?? null;
    const subscription = primaryMembership?.restaurant.subscriptions[0] ?? null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: primaryMembership?.role ?? "-",
      isActive: user.isActive && !user.deletedAt,
      isDeleted: Boolean(user.deletedAt),
      relatedRestaurant: primaryMembership?.restaurant.name ?? "-",
      relatedRestaurantId: primaryMembership?.restaurantId ?? null,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      subscriptionStatus: subscription?.status ?? "YOK",
      isOwner: user.memberships.some((membership) => membership.role === "OWNER"),
    };
  });
}

export async function listSuperAdminRestaurants() {
  const restaurants = await prisma.restaurant.findMany({
    include: {
      memberships: {
        include: { user: { select: { id: true, email: true, name: true } } },
      },
      branches: {
        include: {
          _count: { select: { tables: true, menuItems: true } },
        },
      },
      subscriptions: {
        include: { plan: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const now = Date.now();

  return restaurants.map((restaurant) => {
    const owner = restaurant.memberships.find((membership) => membership.role === "OWNER");
    const subscription = restaurant.subscriptions[0] ?? null;
    const trialRemainingDays = restaurant.trialEndsAt
      ? Math.ceil((restaurant.trialEndsAt.getTime() - now) / (24 * 60 * 60 * 1000))
      : null;

    return {
      id: restaurant.id,
      name: restaurant.name,
      ownerEmail: owner?.user.email ?? "-",
      ownerUserId: owner?.user.id ?? null,
      status: restaurant.status,
      subscriptionStatus: subscription?.status ?? "YOK",
      plan: subscription?.plan.name ?? "-",
      trialRemainingDays,
      trialEndsAt: restaurant.trialEndsAt,
      createdAt: restaurant.createdAt,
      branchesCount: restaurant.branches.length,
      tablesCount: restaurant.branches.reduce((sum, branch) => sum + branch._count.tables, 0),
      staffCount: restaurant.memberships.length,
    };
  });
}

export async function getSuperAdminRestaurantDetail(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    include: {
      currentPlan: true,
      memberships: {
        include: { user: { select: { id: true, email: true, name: true, isActive: true, lastLoginAt: true } } },
        orderBy: { createdAt: "asc" },
      },
      branches: {
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
          menuItems: true,
        },
        orderBy: { createdAt: "asc" },
      },
      subscriptions: {
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      },
      platformPayments: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!restaurant) return null;

  const branchIds = restaurant.branches.map((branch) => branch.id);
  const recentOrders = await prisma.order.findMany({
    where: { branchId: { in: branchIds } },
    include: {
      branch: { select: { name: true } },
      items: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return {
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    status: restaurant.status,
    workspaceMode: restaurant.workspaceMode,
    defaultCurrency: restaurant.defaultCurrency,
    trialStartedAt: restaurant.trialStartedAt,
    trialEndsAt: restaurant.trialEndsAt,
    createdAt: restaurant.createdAt,
    owner: restaurant.memberships.find((membership) => membership.role === "OWNER") ?? null,
    staff: restaurant.memberships,
    branches: restaurant.branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      slug: branch.slug,
      tablesCount: branch.tables.length,
      menuCount: branch.menuItems.length,
      tables: branch.tables.map((table) => ({
        id: table.id,
        name: table.name,
        code: table.code,
        capacity: table.capacity,
        status: table.status,
        activeSessionsCount: table.sessions.length,
      })),
    })),
    menuCount: restaurant.branches.reduce((sum, branch) => sum + branch.menuItems.length, 0),
    tablesCount: restaurant.branches.reduce((sum, branch) => sum + branch.tables.length, 0),
    subscriptions: restaurant.subscriptions,
    payments: restaurant.platformPayments.map((payment) => ({
      ...payment,
      amount: formatMoney(payment.amount),
    })),
    recentOrders: recentOrders.map((order) => ({
      id: order.id,
      branchName: order.branch.name,
      status: order.status,
      source: order.source,
      itemCount: order.items.length,
      createdAt: order.createdAt,
    })),
    adminNotes: "Admin notlari icin platform_settings veya ayri not tablosu eklenebilir.",
  };
}

export async function listSuperAdminSubscriptions() {
  const subscriptions = await prisma.tenantSubscription.findMany({
    include: {
      plan: true,
      restaurant: {
        include: {
          memberships: {
            where: { role: "OWNER" },
            include: { user: { select: { email: true } } },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return subscriptions.map((subscription) => ({
    id: subscription.id,
    restaurantId: subscription.restaurantId,
    restaurant: subscription.restaurant.name,
    ownerEmail: subscription.restaurant.memberships[0]?.user.email ?? "-",
    status: subscription.status,
    trialEndsAt: subscription.restaurant.trialEndsAt,
    currentPeriodEnd: subscription.currentPeriodEnd,
    plan: subscription.plan.name,
    priceTry: formatMoney(subscription.plan.monthlyPrice),
  }));
}

export async function listSuperAdminPayments() {
  const payments = await prisma.platformPayment.findMany({
    include: {
      restaurant: {
        include: {
          memberships: {
            where: { role: "OWNER" },
            include: { user: { select: { email: true } } },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return payments.map((payment) => ({
    id: payment.id,
    restaurant: payment.restaurant.name,
    restaurantId: payment.restaurantId,
    ownerEmail: payment.restaurant.memberships[0]?.user.email ?? "-",
    amount: formatMoney(payment.amount),
    currency: payment.currency,
    provider: payment.provider,
    status: payment.status,
    paymentDate: payment.succeededAt ?? payment.createdAt,
    providerPaymentId: payment.providerPaymentId,
    rawResponse: payment.metadata,
  }));
}

export async function getSuperAdminPlan() {
  const [plan, settings] = await Promise.all([ensureProPlan(), getPlatformSettings()]);

  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    monthlyPrice: formatMoney(plan.monthlyPrice),
    currency: plan.currency,
    trialDays: settings.trialDurationDays,
    trialEnabled: settings.trialEnabled,
    isActive: plan.isActive,
    features: plan.features,
  };
}

export async function listSuperAdminAuditLogs() {
  return prisma.adminAuditLog.findMany({
    include: {
      admin: {
        select: { email: true, name: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

export async function resetRestaurantTrial(restaurantId: string) {
  const settings = await getPlatformSettings();
  const plan = await ensureProPlan();
  const now = new Date();
  const trialEndsAt = addDays(now, settings.trialDurationDays);

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: {
      status: "TRIALING",
      workspaceMode: "TRIAL",
      currentPlanId: plan.id,
      trialStartedAt: now,
      trialEndsAt,
    },
  });

  const existing = await prisma.tenantSubscription.findFirst({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    await prisma.tenantSubscription.update({
      where: { id: existing.id },
      data: {
        planId: plan.id,
        status: "TRIALING",
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
        cancelAtPeriodEnd: false,
        autoRenew: true,
      },
    });
  } else {
    await prisma.tenantSubscription.create({
      data: {
        restaurantId,
        planId: plan.id,
        status: "TRIALING",
        billingPeriod: "MONTHLY",
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
      },
    });
  }
}

export async function activateRestaurantPro(restaurantId: string) {
  const plan = await ensureProPlan();
  const now = new Date();
  const periodEnd = addMonths(now, 1);

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: {
      status: "ACTIVE",
      workspaceMode: "LIVE",
      currentPlanId: plan.id,
    },
  });

  const existing = await prisma.tenantSubscription.findFirst({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    await prisma.tenantSubscription.update({
      where: { id: existing.id },
      data: {
        planId: plan.id,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        nextBillingDate: periodEnd,
        cancelAtPeriodEnd: false,
        autoRenew: true,
      },
    });
  } else {
    await prisma.tenantSubscription.create({
      data: {
        restaurantId,
        planId: plan.id,
        status: "ACTIVE",
        billingPeriod: "MONTHLY",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        nextBillingDate: periodEnd,
      },
    });
  }
}

export async function expireRestaurantTrial(restaurantId: string) {
  const expiredAt = subDays(new Date(), 1);

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: {
      status: "PAST_DUE",
      trialEndsAt: expiredAt,
    },
  });

  await prisma.tenantSubscription.updateMany({
    where: { restaurantId },
    data: {
      status: "PAST_DUE",
      currentPeriodEnd: expiredAt,
    },
  });
}
