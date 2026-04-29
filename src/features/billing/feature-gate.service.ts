import { prisma } from "@/lib/prisma";
import { RouteAccessError } from "@/lib/errors";
import {
  type FeatureAccess,
  type SubscriptionAccessStatus,
  type PlanFeatures,
  type PlanLimits,
  type UsageSummary,
} from "./feature-gate.types";
import {
  LOCKED_PLAN_FEATURES,
  getEffectiveTrialEndsAt,
  PRO_PLAN_CODE,
  PRO_PLAN_FEATURES,
  PRO_PLAN_LIMITS,
} from "./plan-config";

const DEFAULT_LIMITS: PlanLimits = PRO_PLAN_LIMITS;

type PlanRecord = {
  id: string;
  code: string;
  name: string;
  includedBranches: number;
  includedTables: number;
  includedStaff: number;
  features: unknown;
} | null;

export async function getRestaurantFeatures(
  restaurantId: string
): Promise<FeatureAccess> {
  const [restaurant, proPlan] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        currentPlan: true,
        subscriptions: {
          where: { status: { in: ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED"] } },
          include: { plan: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
    prisma.subscriptionPlan.findFirst({
      where: { code: PRO_PLAN_CODE },
    }),
  ]);

  if (!restaurant) {
    throw new Error(`Restaurant ${restaurantId} not found`);
  }

  const subscription = restaurant.subscriptions[0] || null;
  const status = determineAccessStatus(restaurant, subscription);
  const isPremiumLocked = isPremiumLockedStatus(status);
  const activePlan = restaurant.currentPlan ?? subscription?.plan ?? null;
  const effectivePlan = resolveEffectivePlan(status, activePlan, proPlan);
  const features = resolveFeatures(effectivePlan, status, isPremiumLocked);
  const limits = resolveLimits(effectivePlan);

  const usage = await getUsageSummary(restaurantId);

  const canAdd = {
    branch: usage.branches < limits.maxBranches && !isPremiumLocked,
    table: usage.tables < limits.maxTables && !isPremiumLocked,
    staff: usage.staff < limits.maxStaff && !isPremiumLocked,
  };

  return {
    status,
    isAccessible: true,
    isPremiumLocked,
    features,
    limits,
    usage,
    canAdd,
    plan: effectivePlan
      ? { id: effectivePlan.id, code: effectivePlan.code, name: effectivePlan.name }
      : null,
  };
}

export async function assertFeatureEnabled(
  restaurantId: string,
  feature: keyof PlanFeatures,
  message?: string
): Promise<void> {
  const access = await getRestaurantFeatures(restaurantId);

  if (!access.features[feature]) {
    throw new RouteAccessError(
      message ?? `Feature "${feature}" is not available on your current plan`,
      403
    );
  }
}

export async function assertWithinLimit(
  restaurantId: string,
  metric: "branch" | "table" | "staff"
): Promise<void> {
  const access = await getRestaurantFeatures(restaurantId);

  const limitMap = { branch: "maxBranches", table: "maxTables", staff: "maxStaff" } as const;
  const usageMap = { branch: "branches", table: "tables", staff: "staff" } as const;

  const limitKey = limitMap[metric];
  const usageKey = usageMap[metric];

  const canAdd = access.canAdd[metric];
  const current = access.usage[usageKey];
  const limit = access.limits[limitKey];

  if (access.isPremiumLocked) {
    throw new RouteAccessError(
      `Billing access required: activate Pro plan to add ${usageKey}.`,
      403
    );
  }

  if (!canAdd) {
    throw new RouteAccessError(
      `Plan capacity reached: you have ${current}/${limit} ${usageKey}.`,
      403
    );
  }
}

function determineAccessStatus(
  restaurant: { status: any; trialStartedAt: Date | null; trialEndsAt: Date | null },
  subscription: { status: any } | null
): SubscriptionAccessStatus {
  if (!subscription) {
    return "no_subscription";
  }

  if (subscription.status === "ACTIVE") {
    return "active";
  }

  if (subscription.status === "PAST_DUE") {
    return "past_due";
  }

  if (subscription.status === "CANCELLED") {
    return "cancelled";
  }

  if (subscription.status === "TRIALING") {
    const now = new Date();
    const effectiveTrialEndsAt = getEffectiveTrialEndsAt(restaurant.trialStartedAt, restaurant.trialEndsAt);
    if (effectiveTrialEndsAt && effectiveTrialEndsAt <= now) {
      return "expired_trial";
    }
    return "trial";
  }

  return "no_subscription";
}

function isPremiumLockedStatus(status: SubscriptionAccessStatus): boolean {
  return ["expired_trial", "past_due", "cancelled", "no_subscription"].includes(
    status
  );
}

function resolveFeatures(
  plan: PlanRecord,
  status: SubscriptionAccessStatus,
  isPremiumLocked: boolean
): PlanFeatures {
  if (isPremiumLocked) {
    return LOCKED_PLAN_FEATURES;
  }

  if (status === "trial") {
    return PRO_PLAN_FEATURES;
  }

  if (plan?.code === PRO_PLAN_CODE) {
    return PRO_PLAN_FEATURES;
  }

  return normalizePlanFeatures(plan?.features);
}

function resolveEffectivePlan(
  status: SubscriptionAccessStatus,
  activePlan: PlanRecord,
  proPlan: PlanRecord
): PlanRecord {
  if (status === "trial") {
    return proPlan ?? activePlan;
  }

  if (activePlan?.code === PRO_PLAN_CODE) {
    return proPlan ?? activePlan;
  }

  return activePlan;
}

function resolveLimits(plan: PlanRecord): PlanLimits {
  if (!plan) {
    return DEFAULT_LIMITS;
  }

  if (plan.code === PRO_PLAN_CODE) {
    return {
      maxBranches: plan.includedBranches || PRO_PLAN_LIMITS.maxBranches,
      maxTables: plan.includedTables || PRO_PLAN_LIMITS.maxTables,
      maxStaff: plan.includedStaff || PRO_PLAN_LIMITS.maxStaff,
    };
  }

  return {
    maxBranches: plan.includedBranches,
    maxTables: plan.includedTables,
    maxStaff: plan.includedStaff,
  };
}

function normalizePlanFeatures(planFeatures: unknown): PlanFeatures {
  const features =
    planFeatures && typeof planFeatures === "object" && !Array.isArray(planFeatures)
      ? (planFeatures as Record<string, boolean>)
      : {};

  return {
    qrOrdering: features.qrOrdering ?? false,
    splitBill: features.splitBill ?? false,
    onlinePayments: features.onlinePayments ?? false,
    kitchenDisplay: features.kitchenDisplay ?? false,
    staffManagement: features.staffManagement ?? false,
    cashierPanel: features.cashierPanel ?? false,
    tableManagement: features.tableManagement ?? false,
    menuManagement: features.menuManagement ?? false,
    basicAnalytics: features.basicAnalytics ?? features.advancedAnalytics ?? false,
    pwaAccess: features.pwaAccess ?? false,
  };
}

async function getUsageSummary(restaurantId: string): Promise<UsageSummary> {
  const [branchCount, tableCount, staffCount] = await Promise.all([
    prisma.branch.count({
      where: { restaurantId },
    }),
    prisma.table.count({
      where: { branch: { restaurantId } },
    }),
    prisma.membership.count({
      where: { restaurantId, status: "ACTIVE" },
    }),
  ]);

  return {
    branches: branchCount,
    tables: tableCount,
    staff: staffCount,
  };
}
