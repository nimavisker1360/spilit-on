export type SupportedLocale = "tr" | "en";

export type RestaurantStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";

export type WorkspaceMode = "DEMO" | "TRIAL" | "LIVE";

export type StaffRole =
  | "PLATFORM_OWNER"
  | "PLATFORM_SUPPORT"
  | "OWNER"
  | "ADMIN"
  | "BRANCH_MANAGER"
  | "CASHIER"
  | "WAITER"
  | "KITCHEN";

export type MembershipStatus = "INVITED" | "ACTIVE" | "DISABLED";

export type BillingPeriod = "MONTHLY" | "ANNUAL";

export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED";

export type AuditActorType = "USER" | "CUSTOMER" | "SYSTEM" | "PLATFORM";

export type Permission =
  | "tenant.read"
  | "tenant.update"
  | "branch.create"
  | "branch.update"
  | "branch.delete"
  | "table.manage"
  | "table.qr.read"
  | "menu.manage"
  | "session.read"
  | "session.open"
  | "order.create.manual"
  | "kitchen.read"
  | "kitchen.update"
  | "cashier.read"
  | "cashier.invoice.create"
  | "cashier.payment.manage"
  | "platform.manage";

export type AccessContext = {
  actorType: AuditActorType;
  userId: string;
  email: string;
  name: string;
  role: StaffRole;
  restaurantId: string;
  branchIds: string[] | null;
  source: "dev-bootstrap" | "header";
};
