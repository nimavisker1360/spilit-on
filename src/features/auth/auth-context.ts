import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RouteAccessError } from "@/lib/errors";
import type { AccessContext, Permission, StaffRole } from "@/features/auth/auth.types";
import { isTenantWideRole, roleHasPermission } from "@/features/auth/permissions";

export async function getRequestAccessContext(_request?: Request): Promise<AccessContext> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new RouteAccessError("Kimlik doğrulama gerekli.", 401);
  }

  const userId = session.user.id;
  const sessionRole = (session as { role?: StaffRole | null }).role;
  const sessionRestaurantId = (session as { restaurantId?: string | null }).restaurantId;

  if (!sessionRole || !sessionRestaurantId) {
    throw new RouteAccessError("Restoran üyeliği bulunamadı.", 403);
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
    throw new RouteAccessError("Aktif üyelik bulunamadı.", 403);
  }

  const isPlatformRole =
    membership.role === "PLATFORM_OWNER" || membership.role === "PLATFORM_SUPPORT";

  const branchIds = isTenantWideRole(membership.role)
    ? null
    : membership.branchAccess.length > 0
      ? membership.branchAccess.map((a: { branchId: string }) => a.branchId)
      : await prisma.branch
          .findMany({ where: { restaurantId: sessionRestaurantId }, select: { id: true } })
          .then((branches) => branches.map((b) => b.id));

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
    throw new RouteAccessError("Bu işlemi gerçekleştirme yetkiniz yok.");
  }

  if (!branchId || context.branchIds === null) return;

  if (!context.branchIds.includes(branchId)) {
    throw new RouteAccessError("Bu şubeye erişim yetkiniz yok.");
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
      const cat = await prisma.menuCategory.findUnique({
        where: { id: entityId },
        select: { branchId: true },
      });
      return cat?.branchId ?? null;
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
