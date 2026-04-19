import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  KitchenItemStatus,
  OrderSource,
  OrderStatus,
  PaymentSessionStatus,
  PaymentShareStatus,
  PaymentStatus,
  SessionStatus,
  SplitMode,
  TableStatus
} from "@prisma/client";

import type { JsonValue, PaymentAttemptStatus } from "@/features/payment/payment.types";
import type {
  AuditActorType,
  BillingPeriod,
  MembershipStatus,
  RestaurantStatus,
  StaffRole,
  SubscriptionStatus,
  SupportedLocale,
  WorkspaceMode
} from "@/features/auth/auth.types";
import { normalizeCurrencyCode, normalizeMoneyStorage } from "@/lib/currency";

type RestaurantRecord = {
  id: string;
  name: string;
  slug: string;
  legalName: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  billingEmail: string | null;
  phone: string | null;
  status: RestaurantStatus;
  workspaceMode: WorkspaceMode;
  defaultLocale: SupportedLocale;
  defaultCurrency: string;
  currentPlanId: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type BranchRecord = {
  id: string;
  restaurantId: string;
  name: string;
  slug: string;
  location: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  fontFamily: string | null;
  currency: string;
  localeDefault: SupportedLocale;
  openingHours: JsonValue | null;
  createdAt: string;
  updatedAt: string;
};

type BranchSettingsRecord = {
  id: string;
  restaurantId: string;
  branchId: string;
  taxIncludedInPrices: boolean;
  defaultTaxRatePercent: string;
  serviceFeeType: "NONE" | "PERCENT" | "FIXED";
  serviceFeeValue: string;
  allowCustomerNotes: boolean;
  allowSplitBill: boolean;
  allowOnlinePayment: boolean;
  requireStaffApprovalForQrOrders: boolean;
  autoAcceptQrOrders: boolean;
  supportedLocales: SupportedLocale[];
  createdAt: string;
  updatedAt: string;
};

type UserRecord = {
  id: string;
  email: string;
  phone: string | null;
  name: string;
  passwordHash: string | null;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type MembershipRecord = {
  id: string;
  restaurantId: string;
  userId: string;
  role: StaffRole;
  status: MembershipStatus;
  invitedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

type MembershipBranchAccessRecord = {
  id: string;
  membershipId: string;
  branchId: string;
  createdAt: string;
};

type InvitationRecord = {
  id: string;
  restaurantId: string;
  email: string;
  role: StaffRole;
  branchIds: string[];
  tokenHash: string;
  expiresAt: string;
  acceptedAt: string | null;
  invitedByUserId: string | null;
  createdAt: string;
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
  imageUrl: string | null;
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
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  openedAt: string;
  closedAt: string | null;
  readyToCloseAt: string | null;
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
  itemName: string | null;
  quantity: number | null;
  unitPrice: string | null;
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

type PaymentSessionRecord = {
  id: string;
  sessionId: string;
  invoiceId: string;
  splitMode: SplitMode;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  currency: string;
  status: PaymentSessionStatus;
  createdAt: string;
  updatedAt: string;
};

type PaymentShareRecord = {
  id: string;
  paymentSessionId: string;
  userId: string | null;
  guestId: string | null;
  payerLabel: string;
  amount: string;
  tip: string;
  status: PaymentShareStatus;
  provider: string | null;
  providerPaymentId: string | null;
  providerConversationId: string | null;
  paymentUrl: string | null;
  qrPayload: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PaymentAttemptRecord = {
  id: string;
  paymentShareId: string;
  provider: string;
  requestPayload: JsonValue;
  callbackPayload: JsonValue | null;
  status: PaymentAttemptStatus;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

type SubscriptionPlanRecord = {
  id: string;
  code: string;
  name: string;
  monthlyPrice: string;
  annualPrice: string;
  currency: string;
  includedTables: number;
  includedBranches: number;
  includedStaff: number;
  commissionRate: string;
  features: Record<string, boolean | number | string>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type TenantSubscriptionRecord = {
  id: string;
  restaurantId: string;
  planId: string;
  provider: string;
  providerSubscriptionId: string | null;
  status: SubscriptionStatus;
  billingPeriod: BillingPeriod;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
};

type UsageCounterRecord = {
  id: string;
  restaurantId: string;
  branchId: string | null;
  metric: string;
  value: number;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  updatedAt: string;
};

type AuditLogRecord = {
  id: string;
  restaurantId: string | null;
  branchId: string | null;
  actorType: AuditActorType;
  actorUserId: string | null;
  actorRole: StaffRole | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: JsonValue | null;
  after: JsonValue | null;
  metadata: JsonValue | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type LocalStoreData = {
  restaurants: RestaurantRecord[];
  branches: BranchRecord[];
  branchSettings: BranchSettingsRecord[];
  users: UserRecord[];
  memberships: MembershipRecord[];
  membershipBranchAccess: MembershipBranchAccessRecord[];
  invitations: InvitationRecord[];
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
  paymentSessions: PaymentSessionRecord[];
  paymentShares: PaymentShareRecord[];
  paymentAttempts: PaymentAttemptRecord[];
  subscriptionPlans: SubscriptionPlanRecord[];
  subscriptions: TenantSubscriptionRecord[];
  usageCounters: UsageCounterRecord[];
  auditLogs: AuditLogRecord[];
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
        trialStartedAt: timestamp(),
        trialEndsAt: timestamp("2026-05-15T09:00:00.000Z"),
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
        logoUrl: null,
        coverImageUrl: null,
        primaryColor: "#f28c28",
        accentColor: "#ffd6b5",
        fontFamily: "\"Trebuchet MS\", \"Segoe UI\", sans-serif",
        currency: "TRY",
        localeDefault: "tr",
        openingHours: null,
        createdAt: timestamp(),
        updatedAt: timestamp()
      }
    ],
    branchSettings: [
      {
        id: "branch_settings_main",
        restaurantId: "restaurant_main",
        branchId: "branch_main",
        taxIncludedInPrices: true,
        defaultTaxRatePercent: "10.00",
        serviceFeeType: "NONE",
        serviceFeeValue: "0.00",
        allowCustomerNotes: true,
        allowSplitBill: true,
        allowOnlinePayment: false,
        requireStaffApprovalForQrOrders: false,
        autoAcceptQrOrders: true,
        supportedLocales: ["tr", "en"],
        createdAt: timestamp(),
        updatedAt: timestamp()
      }
    ],
    users: [
      {
        id: "user_owner_demo",
        email: "owner@splittable.local",
        phone: null,
        name: "Demo Owner",
        passwordHash: null,
        emailVerifiedAt: timestamp(),
        phoneVerifiedAt: null,
        lastLoginAt: null,
        createdAt: timestamp(),
        updatedAt: timestamp()
      }
    ],
    memberships: [
      {
        id: "membership_owner_demo",
        restaurantId: "restaurant_main",
        userId: "user_owner_demo",
        role: "OWNER",
        status: "ACTIVE",
        invitedByUserId: null,
        createdAt: timestamp(),
        updatedAt: timestamp()
      }
    ],
    membershipBranchAccess: [],
    invitations: [],
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
        imageUrl: null,
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
        imageUrl: null,
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
    payments: [],
    paymentSessions: [],
    paymentShares: [],
    paymentAttempts: [],
    subscriptionPlans: [
      {
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
        createdAt: timestamp(),
        updatedAt: timestamp()
      }
    ],
    subscriptions: [
      {
        id: "subscription_trial_main",
        restaurantId: "restaurant_main",
        planId: "plan_trial",
        provider: "manual",
        providerSubscriptionId: null,
        status: "TRIALING",
        billingPeriod: "MONTHLY",
        currentPeriodStart: timestamp(),
        currentPeriodEnd: timestamp("2026-05-15T09:00:00.000Z"),
        cancelAtPeriodEnd: false,
        createdAt: timestamp(),
        updatedAt: timestamp()
      }
    ],
    usageCounters: [],
    auditLogs: []
  };
}

function isRestaurantStatus(value: unknown): value is RestaurantStatus {
  return value === "TRIALING" || value === "ACTIVE" || value === "PAST_DUE" || value === "SUSPENDED" || value === "CANCELLED";
}

function isWorkspaceMode(value: unknown): value is WorkspaceMode {
  return value === "DEMO" || value === "TRIAL" || value === "LIVE";
}

function isStaffRole(value: unknown): value is StaffRole {
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

function isMembershipStatus(value: unknown): value is MembershipStatus {
  return value === "INVITED" || value === "ACTIVE" || value === "DISABLED";
}

function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return value === "TRIALING" || value === "ACTIVE" || value === "PAST_DUE" || value === "CANCELLED";
}

function isBillingPeriod(value: unknown): value is BillingPeriod {
  return value === "MONTHLY" || value === "ANNUAL";
}

function isAuditActorType(value: unknown): value is AuditActorType {
  return value === "USER" || value === "CUSTOMER" || value === "SYSTEM" || value === "PLATFORM";
}

function normalizeSupportedLocale(value: unknown): SupportedLocale {
  return value === "en" || value === "EN" ? "en" : "tr";
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (typeof value !== "object") {
    return false;
  }

  return Object.values(value as Record<string, unknown>).every(isJsonValue);
}

function normalizeBranchSettings(store: LocalStoreData): BranchSettingsRecord[] {
  const existingSettings = Array.isArray(store.branchSettings) ? store.branchSettings : [];
  const byBranchId = new Map(existingSettings.map((settings) => [settings.branchId, settings]));
  const now = currentTimestamp();

  return (Array.isArray(store.branches) ? store.branches : []).map((branch) => {
    const existing = byBranchId.get(branch.id);

    return {
      id: typeof existing?.id === "string" ? existing.id : makeId("branch_settings"),
      restaurantId: branch.restaurantId,
      branchId: branch.id,
      taxIncludedInPrices: typeof existing?.taxIncludedInPrices === "boolean" ? existing.taxIncludedInPrices : true,
      defaultTaxRatePercent: normalizeMoneyStorage(existing?.defaultTaxRatePercent ?? "10.00"),
      serviceFeeType:
        existing?.serviceFeeType === "PERCENT" || existing?.serviceFeeType === "FIXED"
          ? existing.serviceFeeType
          : "NONE",
      serviceFeeValue: normalizeMoneyStorage(existing?.serviceFeeValue ?? "0.00", "0.00"),
      allowCustomerNotes: typeof existing?.allowCustomerNotes === "boolean" ? existing.allowCustomerNotes : true,
      allowSplitBill: typeof existing?.allowSplitBill === "boolean" ? existing.allowSplitBill : true,
      allowOnlinePayment: typeof existing?.allowOnlinePayment === "boolean" ? existing.allowOnlinePayment : false,
      requireStaffApprovalForQrOrders:
        typeof existing?.requireStaffApprovalForQrOrders === "boolean" ? existing.requireStaffApprovalForQrOrders : false,
      autoAcceptQrOrders: typeof existing?.autoAcceptQrOrders === "boolean" ? existing.autoAcceptQrOrders : true,
      supportedLocales:
        Array.isArray(existing?.supportedLocales) && existing.supportedLocales.length > 0
          ? existing.supportedLocales.map(normalizeSupportedLocale)
          : ["tr", "en"],
      createdAt: typeof existing?.createdAt === "string" ? existing.createdAt : now,
      updatedAt: typeof existing?.updatedAt === "string" ? existing.updatedAt : now
    };
  });
}

function normalizeSubscriptionPlans(store: LocalStoreData): SubscriptionPlanRecord[] {
  const plans = Array.isArray(store.subscriptionPlans) && store.subscriptionPlans.length > 0
    ? store.subscriptionPlans
    : defaultStore().subscriptionPlans;

  return plans.map((plan) => ({
    ...plan,
    monthlyPrice: normalizeMoneyStorage(plan.monthlyPrice, "0.00"),
    annualPrice: normalizeMoneyStorage(plan.annualPrice, "0.00"),
    currency: normalizeCurrencyCode(plan.currency),
    includedTables: Number.isInteger(plan.includedTables) && plan.includedTables >= 0 ? plan.includedTables : 0,
    includedBranches: Number.isInteger(plan.includedBranches) && plan.includedBranches >= 0 ? plan.includedBranches : 0,
    includedStaff: Number.isInteger(plan.includedStaff) && plan.includedStaff >= 0 ? plan.includedStaff : 0,
    commissionRate: normalizeMoneyStorage(plan.commissionRate, "0.00"),
    features: plan.features && typeof plan.features === "object" && !Array.isArray(plan.features) ? plan.features : {},
    isActive: typeof plan.isActive === "boolean" ? plan.isActive : true
  }));
}

function normalizeSubscriptions(store: LocalStoreData): TenantSubscriptionRecord[] {
  const subscriptions = Array.isArray(store.subscriptions) ? store.subscriptions : [];

  return subscriptions.map((subscription) => ({
    ...subscription,
    provider: typeof subscription.provider === "string" ? subscription.provider : "manual",
    providerSubscriptionId:
      typeof subscription.providerSubscriptionId === "string" ? subscription.providerSubscriptionId : null,
    status: isSubscriptionStatus(subscription.status) ? subscription.status : "TRIALING",
    billingPeriod: isBillingPeriod(subscription.billingPeriod) ? subscription.billingPeriod : "MONTHLY",
    cancelAtPeriodEnd: typeof subscription.cancelAtPeriodEnd === "boolean" ? subscription.cancelAtPeriodEnd : false
  }));
}

function normalizeStore(store: LocalStoreData): LocalStoreData {
  return {
    ...store,
    restaurants: Array.isArray(store.restaurants)
      ? store.restaurants.map((restaurant) => ({
          ...restaurant,
          legalName: typeof restaurant.legalName === "string" ? restaurant.legalName : null,
          taxNumber: typeof restaurant.taxNumber === "string" ? restaurant.taxNumber : null,
          taxOffice: typeof restaurant.taxOffice === "string" ? restaurant.taxOffice : null,
          billingEmail: typeof restaurant.billingEmail === "string" ? restaurant.billingEmail : null,
          phone: typeof restaurant.phone === "string" ? restaurant.phone : null,
          status: isRestaurantStatus(restaurant.status) ? restaurant.status : "TRIALING",
          workspaceMode: isWorkspaceMode(restaurant.workspaceMode) ? restaurant.workspaceMode : "TRIAL",
          defaultLocale: normalizeSupportedLocale(restaurant.defaultLocale),
          defaultCurrency: normalizeCurrencyCode(restaurant.defaultCurrency),
          currentPlanId: typeof restaurant.currentPlanId === "string" ? restaurant.currentPlanId : "plan_trial",
          trialStartedAt: typeof restaurant.trialStartedAt === "string" ? restaurant.trialStartedAt : null,
          trialEndsAt: typeof restaurant.trialEndsAt === "string" ? restaurant.trialEndsAt : null
        }))
      : [],
    branches: Array.isArray(store.branches)
      ? store.branches.map((branch) => ({
          ...branch,
          location: typeof branch.location === "string" ? branch.location : null,
          logoUrl: typeof branch.logoUrl === "string" ? branch.logoUrl : null,
          coverImageUrl: typeof branch.coverImageUrl === "string" ? branch.coverImageUrl : null,
          primaryColor: typeof branch.primaryColor === "string" ? branch.primaryColor : "#f28c28",
          accentColor: typeof branch.accentColor === "string" ? branch.accentColor : "#ffd6b5",
          fontFamily:
            typeof branch.fontFamily === "string" && branch.fontFamily.trim()
              ? branch.fontFamily
              : "\"Trebuchet MS\", \"Segoe UI\", sans-serif",
          currency: normalizeCurrencyCode(branch.currency),
          localeDefault: normalizeSupportedLocale(branch.localeDefault),
          openingHours: isJsonValue(branch.openingHours) ? branch.openingHours : null
        }))
      : [],
    branchSettings: normalizeBranchSettings(store),
    users: Array.isArray(store.users)
      ? store.users.map((user) => ({
          ...user,
          phone: typeof user.phone === "string" ? user.phone : null,
          passwordHash: typeof user.passwordHash === "string" ? user.passwordHash : null,
          emailVerifiedAt: typeof user.emailVerifiedAt === "string" ? user.emailVerifiedAt : null,
          phoneVerifiedAt: typeof user.phoneVerifiedAt === "string" ? user.phoneVerifiedAt : null,
          lastLoginAt: typeof user.lastLoginAt === "string" ? user.lastLoginAt : null
        }))
      : [],
    memberships: Array.isArray(store.memberships)
      ? store.memberships.map((membership) => ({
          ...membership,
          role: isStaffRole(membership.role) ? membership.role : "WAITER",
          status: isMembershipStatus(membership.status) ? membership.status : "ACTIVE",
          invitedByUserId: typeof membership.invitedByUserId === "string" ? membership.invitedByUserId : null
        }))
      : [],
    membershipBranchAccess: Array.isArray(store.membershipBranchAccess) ? store.membershipBranchAccess : [],
    invitations: Array.isArray(store.invitations)
      ? store.invitations.map((invitation) => ({
          ...invitation,
          role: isStaffRole(invitation.role) ? invitation.role : "WAITER",
          branchIds: Array.isArray(invitation.branchIds) ? invitation.branchIds.filter((id) => typeof id === "string") : [],
          acceptedAt: typeof invitation.acceptedAt === "string" ? invitation.acceptedAt : null,
          invitedByUserId: typeof invitation.invitedByUserId === "string" ? invitation.invitedByUserId : null
        }))
      : [],
    menuItems: Array.isArray(store.menuItems)
      ? store.menuItems.map((item) => ({
          ...item,
          imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
          price: normalizeMoneyStorage(item.price)
        }))
      : [],
    sessions: Array.isArray(store.sessions)
      ? store.sessions.map((session) => ({
          ...session,
          totalAmount: normalizeMoneyStorage(session.totalAmount, "0.00"),
          paidAmount: normalizeMoneyStorage(session.paidAmount, "0.00"),
          remainingAmount: normalizeMoneyStorage(session.remainingAmount, normalizeMoneyStorage(session.totalAmount, "0.00")),
          readyToCloseAt: typeof session.readyToCloseAt === "string" ? session.readyToCloseAt : null
        }))
      : [],
    orderItems: Array.isArray(store.orderItems)
      ? store.orderItems.map((item) => ({
          ...item,
          unitPrice: normalizeMoneyStorage(item.unitPrice)
        }))
      : [],
    invoices: Array.isArray(store.invoices)
      ? store.invoices.map((invoice) => ({
          ...invoice,
          total: normalizeMoneyStorage(invoice.total)
        }))
      : [],
    invoiceLines: Array.isArray(store.invoiceLines)
      ? store.invoiceLines.map((line) => {
          const normalizedQuantity = typeof line.quantity === "number" && Number.isInteger(line.quantity) && line.quantity > 0 ? line.quantity : null;

          return {
            ...line,
            amount: normalizeMoneyStorage(line.amount),
            itemName: typeof line.itemName === "string" && line.itemName.trim() ? line.itemName : null,
            quantity: normalizedQuantity,
            unitPrice: typeof line.unitPrice === "string" ? normalizeMoneyStorage(line.unitPrice) : null
          };
        })
      : [],
    invoiceAssignments: Array.isArray(store.invoiceAssignments)
      ? store.invoiceAssignments.map((assignment) => ({
          ...assignment,
          amount: normalizeMoneyStorage(assignment.amount)
        }))
      : [],
    payments: Array.isArray(store.payments)
      ? store.payments.map((payment) => ({
          ...payment,
          amount: normalizeMoneyStorage(payment.amount),
          currency: normalizeCurrencyCode(payment.currency)
        }))
      : [],
    paymentSessions: Array.isArray(store.paymentSessions)
      ? store.paymentSessions.map((paymentSession) => ({
          ...paymentSession,
          totalAmount: normalizeMoneyStorage(paymentSession.totalAmount),
          paidAmount: normalizeMoneyStorage(paymentSession.paidAmount, "0.00"),
          remainingAmount: normalizeMoneyStorage(paymentSession.remainingAmount, normalizeMoneyStorage(paymentSession.totalAmount)),
          currency: normalizeCurrencyCode(paymentSession.currency)
        }))
      : [],
    paymentShares: Array.isArray(store.paymentShares)
      ? store.paymentShares.map((paymentShare) => ({
          ...paymentShare,
          userId: typeof paymentShare.userId === "string" ? paymentShare.userId : paymentShare.guestId ?? null,
          amount: normalizeMoneyStorage(paymentShare.amount),
          tip: normalizeMoneyStorage(paymentShare.tip, "0.00")
        }))
      : [],
    paymentAttempts: Array.isArray(store.paymentAttempts) ? store.paymentAttempts : [],
    subscriptionPlans: normalizeSubscriptionPlans(store),
    subscriptions: normalizeSubscriptions(store),
    usageCounters: Array.isArray(store.usageCounters) ? store.usageCounters : [],
    auditLogs: Array.isArray(store.auditLogs)
      ? store.auditLogs.map((auditLog) => ({
          ...auditLog,
          restaurantId: typeof auditLog.restaurantId === "string" ? auditLog.restaurantId : null,
          branchId: typeof auditLog.branchId === "string" ? auditLog.branchId : null,
          actorType: isAuditActorType(auditLog.actorType) ? auditLog.actorType : "SYSTEM",
          actorUserId: typeof auditLog.actorUserId === "string" ? auditLog.actorUserId : null,
          actorRole: isStaffRole(auditLog.actorRole) ? auditLog.actorRole : null,
          entityId: typeof auditLog.entityId === "string" ? auditLog.entityId : null,
          before: isJsonValue(auditLog.before) ? auditLog.before : null,
          after: isJsonValue(auditLog.after) ? auditLog.after : null,
          metadata: isJsonValue(auditLog.metadata) ? auditLog.metadata : null,
          ipAddress: typeof auditLog.ipAddress === "string" ? auditLog.ipAddress : null,
          userAgent: typeof auditLog.userAgent === "string" ? auditLog.userAgent : null
        }))
      : []
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
  return normalizeStore(JSON.parse(readFileSync(STORE_FILE, "utf8")) as LocalStoreData);
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
  const paymentSessionIds = store.paymentSessions
    .filter((paymentSession) => paymentSession.sessionId === sessionId || invoiceIds.includes(paymentSession.invoiceId))
    .map((paymentSession) => paymentSession.id);
  const paymentShareIds = store.paymentShares
    .filter((paymentShare) => paymentSessionIds.includes(paymentShare.paymentSessionId))
    .map((paymentShare) => paymentShare.id);

  store.guests = store.guests.filter((guest) => guest.sessionId !== sessionId);
  store.sessions = store.sessions.filter((session) => session.id !== sessionId);
  store.orders = store.orders.filter((order) => order.sessionId !== sessionId);
  store.orderItems = store.orderItems.filter((item) => !orderIds.includes(item.orderId));
  store.invoiceLines = store.invoiceLines.filter(
    (line) => !invoiceIds.includes(line.invoiceId) && !orderItemIds.includes(line.orderItemId)
  );
  store.invoiceAssignments = store.invoiceAssignments.filter((assignment) => !invoiceIds.includes(assignment.invoiceId));
  store.payments = store.payments.filter((payment) => !invoiceIds.includes(payment.invoiceId));
  store.paymentAttempts = store.paymentAttempts.filter((paymentAttempt) => !paymentShareIds.includes(paymentAttempt.paymentShareId));
  store.paymentShares = store.paymentShares.filter((paymentShare) => !paymentSessionIds.includes(paymentShare.paymentSessionId));
  store.paymentSessions = store.paymentSessions.filter((paymentSession) => !paymentSessionIds.includes(paymentSession.id));
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
  store.branchSettings = store.branchSettings.filter((settings) => settings.branchId !== branchId);
  store.membershipBranchAccess = store.membershipBranchAccess.filter((access) => access.branchId !== branchId);
  store.menuItems = store.menuItems.filter((item) => item.branchId !== branchId);
  store.menuCategories = store.menuCategories.filter((category) => category.branchId !== branchId);
  store.branches = store.branches.filter((branch) => branch.id !== branchId);

  if (categoryIds.length > 0) {
    store.menuItems = store.menuItems.filter((item) => !categoryIds.includes(item.categoryId ?? ""));
  }
}
