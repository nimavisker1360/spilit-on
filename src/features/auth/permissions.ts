import type { Permission, StaffRole } from "@/features/auth/auth.types";

const ALL_TENANT_PERMISSIONS: Permission[] = [
  "tenant.read",
  "tenant.update",
  "branch.create",
  "branch.update",
  "branch.delete",
  "table.manage",
  "table.qr.read",
  "menu.manage",
  "session.read",
  "session.open",
  "order.create.manual",
  "kitchen.read",
  "kitchen.update",
  "cashier.read",
  "cashier.invoice.create",
  "cashier.payment.manage"
];

export const ROLE_PERMISSIONS: Record<StaffRole, Permission[]> = {
  PLATFORM_OWNER: [...ALL_TENANT_PERMISSIONS, "platform.manage"],
  PLATFORM_SUPPORT: ["tenant.read", "session.read", "kitchen.read", "cashier.read"],
  OWNER: ALL_TENANT_PERMISSIONS,
  ADMIN: ALL_TENANT_PERMISSIONS,
  BRANCH_MANAGER: [
    "tenant.read",
    "branch.update",
    "table.manage",
    "table.qr.read",
    "menu.manage",
    "session.read",
    "session.open",
    "order.create.manual",
    "kitchen.read",
    "kitchen.update",
    "cashier.read",
    "cashier.invoice.create",
    "cashier.payment.manage"
  ],
  CASHIER: ["tenant.read", "session.read", "cashier.read", "cashier.invoice.create", "cashier.payment.manage"],
  WAITER: ["tenant.read", "session.read", "session.open", "order.create.manual", "kitchen.read"],
  KITCHEN: ["tenant.read", "kitchen.read", "kitchen.update"]
};

export function roleHasPermission(role: StaffRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isTenantWideRole(role: StaffRole): boolean {
  return role === "PLATFORM_OWNER" || role === "OWNER" || role === "ADMIN";
}
