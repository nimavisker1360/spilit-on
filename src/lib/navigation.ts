import type { AppNavLink, AppRole } from "@/types";

export const PRIMARY_NAV_LINKS: AppNavLink[] = [
  { href: "/", label: "Home" },
  { href: "/admin", label: "Admin" },
  { href: "/waiter", label: "Waiter" },
  { href: "/kitchen", label: "Kitchen" },
  { href: "/cashier", label: "Cashier" }
];

export const DASHBOARD_NAV_LINKS: AppNavLink[] = PRIMARY_NAV_LINKS;

type RoleLayoutMeta = {
  title: string;
  subtitle: string;
  activeHref: string;
};

export const ROLE_LAYOUT_META: Record<AppRole, RoleLayoutMeta> = {
  admin: {
    title: "Admin dashboard",
    subtitle: "Manage branches, tables, menu, and QR links.",
    activeHref: "/admin"
  },
  waiter: {
    title: "Waiter dashboard",
    subtitle: "Open sessions and place floor orders quickly.",
    activeHref: "/waiter"
  },
  kitchen: {
    title: "Kitchen dashboard",
    subtitle: "Track active tickets and update prep status.",
    activeHref: "/kitchen"
  },
  cashier: {
    title: "Cashier dashboard",
    subtitle: "Calculate split bills and finalize invoices.",
    activeHref: "/cashier"
  }
};
