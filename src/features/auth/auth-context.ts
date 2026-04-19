import { RouteAccessError } from "@/lib/errors";
import {
  cloneValue,
  currentTimestamp,
  makeId,
  readStore,
  updateStore,
  type LocalStoreData
} from "@/lib/local-store";
import type { AccessContext, Permission, StaffRole } from "@/features/auth/auth.types";
import { isTenantWideRole, roleHasPermission } from "@/features/auth/permissions";

const DEV_AUTH_EMAIL = "owner@splittable.local";
const DEV_AUTH_NAME = "Demo Owner";
const ROLE_HEADER = "x-splittable-role";
const EMAIL_HEADER = "x-splittable-user-email";

function isDevAuthBypassEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.SPLITTABLE_ENABLE_DEV_AUTH === "true";
}

function isStaffRole(value: string | null): value is StaffRole {
  return (
    value === "PLATFORM_OWNER" ||
    value === "PLATFORM_SUPPORT" ||
    value === "OWNER" ||
    value === "ADMIN" ||
    value === "BRANCH_MANAGER" ||
    value === "CASHIER" ||
    value === "WAITER" ||
    value === "KITCHEN"
  );
}

function normalizeEmail(value: string | null): string {
  const email = value?.trim().toLocaleLowerCase("en-US");
  return email && email.includes("@") ? email : DEV_AUTH_EMAIL;
}

function ensureSecurityBootstrap(store: LocalStoreData) {
  const now = currentTimestamp();

  let restaurant = store.restaurants[0];

  if (!restaurant) {
    restaurant = {
      id: makeId("restaurant"),
      name: "Main Restaurant",
      slug: "main-restaurant",
      legalName: null,
      taxNumber: null,
      taxOffice: null,
      billingEmail: null,
      phone: null,
      status: "TRIALING",
      workspaceMode: "TRIAL",
      defaultLocale: "tr",
      defaultCurrency: "TRY",
      currentPlanId: "plan_trial",
      trialStartedAt: now,
      trialEndsAt: null,
      createdAt: now,
      updatedAt: now
    };
    store.restaurants.push(restaurant);
  }

  if (!store.subscriptionPlans.some((plan) => plan.id === "plan_trial")) {
    store.subscriptionPlans.push({
      id: "plan_trial",
      code: "trial",
      name: "Trial",
      monthlyPrice: "0.00",
      annualPrice: "0.00",
      currency: "TRY",
      includedTables: 5,
      includedBranches: 1,
      includedStaff: 3,
      commissionRate: "0.00",
      features: {
        qrOrdering: true,
        splitBill: true,
        kitchenDisplay: true,
        onlinePayments: false,
        advancedAnalytics: false
      },
      isActive: true,
      createdAt: now,
      updatedAt: now
    });
  }

  let user = store.users.find((entry) => entry.email === DEV_AUTH_EMAIL);

  if (!user) {
    user = {
      id: "user_owner_demo",
      email: DEV_AUTH_EMAIL,
      phone: null,
      name: DEV_AUTH_NAME,
      passwordHash: null,
      emailVerifiedAt: now,
      phoneVerifiedAt: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now
    };
    store.users.push(user);
  }

  let membership = store.memberships.find(
    (entry) => entry.restaurantId === restaurant.id && entry.userId === user.id
  );

  if (!membership) {
    membership = {
      id: "membership_owner_demo",
      restaurantId: restaurant.id,
      userId: user.id,
      role: "OWNER",
      status: "ACTIVE",
      invitedByUserId: null,
      createdAt: now,
      updatedAt: now
    };
    store.memberships.push(membership);
  }

  if (!store.subscriptions.some((subscription) => subscription.restaurantId === restaurant.id)) {
    store.subscriptions.push({
      id: makeId("subscription"),
      restaurantId: restaurant.id,
      planId: "plan_trial",
      provider: "manual",
      providerSubscriptionId: null,
      status: "TRIALING",
      billingPeriod: "MONTHLY",
      currentPeriodStart: now,
      currentPeriodEnd: restaurant.trialEndsAt ?? now,
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now
    });
  }

  return { restaurant, user, membership };
}

function resolveContextFromStore(store: LocalStoreData, request: Request): AccessContext {
  if (!isDevAuthBypassEnabled()) {
    throw new RouteAccessError("Authentication is required.", 401);
  }

  const requestedRole = request.headers.get(ROLE_HEADER);
  const requestedEmail = normalizeEmail(request.headers.get(EMAIL_HEADER));
  const role = isStaffRole(requestedRole) ? requestedRole : "OWNER";
  const { restaurant } = ensureSecurityBootstrap(store);
  const now = currentTimestamp();

  let user = store.users.find((entry) => entry.email === requestedEmail);

  if (!user) {
    user = {
      id: makeId("user"),
      email: requestedEmail,
      phone: null,
      name: requestedEmail === DEV_AUTH_EMAIL ? DEV_AUTH_NAME : requestedEmail.split("@")[0] ?? "Staff User",
      passwordHash: null,
      emailVerifiedAt: now,
      phoneVerifiedAt: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now
    };
    store.users.push(user);
  }

  let membership = store.memberships.find(
    (entry) => entry.restaurantId === restaurant.id && entry.userId === user.id
  );

  if (!membership) {
    membership = {
      id: makeId("membership"),
      restaurantId: restaurant.id,
      userId: user.id,
      role,
      status: "ACTIVE",
      invitedByUserId: null,
      createdAt: now,
      updatedAt: now
    };
    store.memberships.push(membership);
  } else if (membership.role !== role && requestedRole && isDevAuthBypassEnabled()) {
    membership.role = role;
    membership.updatedAt = now;
  }

  const tenantBranches = store.branches.filter((branch) => branch.restaurantId === restaurant.id);
  const explicitBranchIds = store.membershipBranchAccess
    .filter((access) => access.membershipId === membership.id)
    .map((access) => access.branchId);

  return {
    actorType: role === "PLATFORM_OWNER" || role === "PLATFORM_SUPPORT" ? "PLATFORM" : "USER",
    userId: user.id,
    email: user.email,
    name: user.name,
    role: membership.role,
    restaurantId: restaurant.id,
    branchIds: isTenantWideRole(membership.role)
      ? null
      : explicitBranchIds.length > 0
        ? explicitBranchIds
        : tenantBranches.map((branch) => branch.id),
    source: requestedRole ? "header" : "dev-bootstrap"
  };
}

export async function getRequestAccessContext(request: Request): Promise<AccessContext> {
  return updateStore((store) => cloneValue(resolveContextFromStore(store, request)));
}

export function assertPermission(context: AccessContext, permission: Permission, branchId?: string | null) {
  if (!roleHasPermission(context.role, permission)) {
    throw new RouteAccessError("You do not have permission to perform this action.");
  }

  if (!branchId || context.branchIds === null) {
    return;
  }

  if (!context.branchIds.includes(branchId)) {
    throw new RouteAccessError("You do not have access to this branch.");
  }
}

export async function requirePermission(
  request: Request,
  permission: Permission,
  options: { branchId?: string | null } = {}
): Promise<AccessContext> {
  const context = await getRequestAccessContext(request);
  assertPermission(context, permission, options.branchId);
  return context;
}

export function getReadableBranchIds(context: AccessContext): string[] | null {
  return context.branchIds;
}

export function resolveEntityBranchId(entityType: string, entityId: string): string | null {
  const store = readStore();

  if (entityType === "branch") {
    return store.branches.some((branch) => branch.id === entityId) ? entityId : null;
  }

  if (entityType === "table") {
    return store.tables.find((table) => table.id === entityId)?.branchId ?? null;
  }

  if (entityType === "tableToken") {
    return store.tables.find((table) => table.publicToken === entityId)?.branchId ?? null;
  }

  if (entityType === "menuCategory") {
    return store.menuCategories.find((category) => category.id === entityId)?.branchId ?? null;
  }

  if (entityType === "menuItem") {
    return store.menuItems.find((item) => item.id === entityId)?.branchId ?? null;
  }

  if (entityType === "session") {
    return store.sessions.find((session) => session.id === entityId)?.branchId ?? null;
  }

  if (entityType === "orderItem") {
    const item = store.orderItems.find((entry) => entry.id === entityId);
    const order = item ? store.orders.find((entry) => entry.id === item.orderId) : null;
    return order?.branchId ?? null;
  }

  if (entityType === "invoice") {
    const invoice = store.invoices.find((entry) => entry.id === entityId);
    const session = invoice ? store.sessions.find((entry) => entry.id === invoice.sessionId) : null;
    return session?.branchId ?? null;
  }

  if (entityType === "paymentShare") {
    const share = store.paymentShares.find((entry) => entry.id === entityId);
    const paymentSession = share
      ? store.paymentSessions.find((entry) => entry.id === share.paymentSessionId)
      : null;
    const session = paymentSession ? store.sessions.find((entry) => entry.id === paymentSession.sessionId) : null;
    return session?.branchId ?? null;
  }

  if (entityType === "tableCode") {
    return store.tables.find((table) => table.code === entityId)?.branchId ?? null;
  }

  return null;
}

export async function requireEntityPermission(
  request: Request,
  permission: Permission,
  entityType: string,
  entityId: string
): Promise<AccessContext> {
  const branchId = resolveEntityBranchId(entityType, entityId);
  return requirePermission(request, permission, { branchId });
}
