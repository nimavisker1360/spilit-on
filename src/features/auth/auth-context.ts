import { auth } from "@/auth";
import type { AccessContext, Permission, StaffRole } from "@/features/auth/auth.types";
import { isTenantWideRole, roleHasPermission } from "@/features/auth/permissions";
import { RouteAccessError } from "@/lib/errors";
import { isDemoAuthEnabled } from "@/lib/demo-auth";
import { prisma } from "@/lib/prisma";

async function getDemoAccessContext(): Promise<AccessContext> {
  const membership = await prisma.membership.findFirst({
    where: { status: "ACTIVE" },
    include: {
      branchAccess: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) {
    throw new RouteAccessError("Demo mode is enabled but no active membership was found.", 503);
  }

  const branchIds = isTenantWideRole(membership.role as StaffRole)
    ? null
    : membership.branchAccess.length > 0
      ? membership.branchAccess.map((access) => access.branchId)
      : await prisma.branch
          .findMany({
            where: { restaurantId: membership.restaurantId },
            select: { id: true },
          })
          .then((branches) => branches.map((branch) => branch.id));

  return {
    actorType: "USER",
    userId: membership.user.id,
    email: membership.user.email ?? "",
    name: membership.user.name ?? "Demo User",
    role: membership.role as StaffRole,
    restaurantId: membership.restaurantId,
    branchIds,
    source: "dev-bootstrap",
  };
}

export async function getRequestAccessContext(_request?: Request): Promise<AccessContext> {
  const session = await auth();

  if (!session?.user?.id) {
    if (isDemoAuthEnabled()) {
      return getDemoAccessContext();
    }

    throw new RouteAccessError("Kimlik dogrulama gerekli.", 401);
  }

  const userId = session.user.id;
  const sessionRole = (session as { role?: StaffRole | null }).role;
  const sessionRestaurantId = (session as { restaurantId?: string | null }).restaurantId;

  if (!sessionRole || !sessionRestaurantId) {
    throw new RouteAccessError("Restoran uyeligi bulunamadi.", 403);
  }

  const membership = await prisma.membership.findUnique({
    where: {
      restaurantId_userId: {
        restaurantId: sessionRestaurantId,
        userId,
      },
    },
    include: {
      branchAccess: true,
    },
  });

  if (!membership || membership.status !== "ACTIVE") {
    throw new RouteAccessError("Aktif uyelik bulunamadi.", 403);
  }

  const isPlatformRole =
    membership.role === "PLATFORM_OWNER" || membership.role === "PLATFORM_SUPPORT";

  const branchIds = isTenantWideRole(membership.role)
    ? null
    : membership.branchAccess.length > 0
      ? membership.branchAccess.map((access: { branchId: string }) => access.branchId)
      : await prisma.branch
          .findMany({ where: { restaurantId: sessionRestaurantId }, select: { id: true } })
          .then((branches) => branches.map((branch) => branch.id));

  return {
    actorType: isPlatformRole ? "PLATFORM" : "USER",
    userId,
    email: session.user.email ?? "",
    name: session.user.name ?? "",
    role: membership.role as StaffRole,
    restaurantId: sessionRestaurantId,
    branchIds,
    source: "session",
  };
}

export function assertPermission(
  context: AccessContext,
  permission: Permission,
  branchId?: string | null
) {
  if (!roleHasPermission(context.role, permission)) {
    throw new RouteAccessError("Bu islemi gerceklestirme yetkiniz yok.");
  }

  if (!branchId || context.branchIds === null) return;

  if (!context.branchIds.includes(branchId)) {
    throw new RouteAccessError("Bu subeye erisim yetkiniz yok.");
  }
}

export async function requirePermission(
  _request: Request,
  permission: Permission,
  options: { branchId?: string | null } = {}
): Promise<AccessContext> {
  const context = await getRequestAccessContext();
  assertPermission(context, permission, options.branchId);
  return context;
}

export function getReadableBranchIds(context: AccessContext): string[] | null {
  return context.branchIds;
}

export async function requireEntityPermission(
  _request: Request,
  permission: Permission,
  entityType: string,
  entityId: string
): Promise<AccessContext> {
  const branchId = await resolveEntityBranchId(entityType, entityId);
  const context = await getRequestAccessContext();
  assertPermission(context, permission, branchId);
  return context;
}

export async function resolveEntityBranchId(
  entityType: string,
  entityId: string
): Promise<string | null> {
  switch (entityType) {
    case "branch":
      return entityId;

    case "table": {
      const table = await prisma.table.findUnique({
        where: { id: entityId },
        select: { branchId: true },
      });
      return table?.branchId ?? null;
    }

    case "tableToken": {
      const table = await prisma.table.findUnique({
        where: { publicToken: entityId },
        select: { branchId: true },
      });
      return table?.branchId ?? null;
    }

    case "tableCode": {
      const table = await prisma.table.findUnique({
        where: { code: entityId },
        select: { branchId: true },
      });
      return table?.branchId ?? null;
    }

    case "menuCategory": {
      const category = await prisma.menuCategory.findUnique({
        where: { id: entityId },
        select: { branchId: true },
      });
      return category?.branchId ?? null;
    }

    case "menuItem": {
      const item = await prisma.menuItem.findUnique({
        where: { id: entityId },
        select: { branchId: true },
      });
      return item?.branchId ?? null;
    }

    case "session": {
      const session = await prisma.tableSession.findUnique({
        where: { id: entityId },
        select: { branchId: true },
      });
      return session?.branchId ?? null;
    }

    case "orderItem": {
      const orderItem = await prisma.orderItem.findUnique({
        where: { id: entityId },
        include: { order: { select: { branchId: true } } },
      });
      return orderItem?.order?.branchId ?? null;
    }

    case "invoice": {
      const invoice = await prisma.invoice.findUnique({
        where: { id: entityId },
        include: { session: { select: { branchId: true } } },
      });
      return invoice?.session?.branchId ?? null;
    }

    case "paymentShare": {
      const share = await prisma.paymentShare.findUnique({
        where: { id: entityId },
        include: {
          paymentSession: {
            include: { session: { select: { branchId: true } } },
          },
        },
      });
      return share?.paymentSession?.session?.branchId ?? null;
    }

    default:
      return null;
  }
}
