export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  activateRestaurantPro,
  DEFAULT_PLATFORM_SETTINGS,
  ensureProPlan,
  expireRestaurantTrial,
  getPlatformSettings,
  getSuperAdminDashboard,
  getSuperAdminPlan,
  getSuperAdminRestaurantDetail,
  listSuperAdminAuditLogs,
  listSuperAdminPayments,
  listSuperAdminRestaurants,
  listSuperAdminSubscriptions,
  listSuperAdminUsers,
  resetRestaurantTrial,
  savePlatformSettings,
  type PlatformSettings,
} from "@/features/super-admin/data";
import {
  requireSuperAdmin,
  superAdminUnauthorizedResponse,
  writeSuperAdminAuditLog,
} from "@/features/super-admin/session";
import { deleteBranch } from "@/features/restaurant/restaurant.service";
import { deleteTable } from "@/features/table/table.service";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: {
    path?: string[];
  };
};

function getPath(context: RouteContext): string[] {
  return context.params.path ?? [];
}

function actionLabel(action: string): string {
  return action.replace(/-/g, "_");
}

async function withSuperAdmin<T>(
  request: Request,
  handler: (admin: Awaited<ReturnType<typeof requireSuperAdmin>>) => Promise<T>
) {
  try {
    const admin = await requireSuperAdmin(request);
    return await handler(admin);
  } catch (error) {
    if (error instanceof Error && error.message === "SUPER_ADMIN_UNAUTHENTICATED") {
      return superAdminUnauthorizedResponse();
    }

    const message = error instanceof Error ? error.message : "Beklenmeyen hata.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request, context: RouteContext) {
  return withSuperAdmin(request, async () => {
    const path = getPath(context);
    const [resource, id] = path;

    if (!resource || resource === "dashboard") {
      return NextResponse.json({ data: await getSuperAdminDashboard() });
    }

    if (resource === "users") {
      return NextResponse.json({ data: await listSuperAdminUsers() });
    }

    if (resource === "restaurants" && id) {
      const detail = await getSuperAdminRestaurantDetail(id);
      if (!detail) return NextResponse.json({ error: "Restoran bulunamadi." }, { status: 404 });
      return NextResponse.json({ data: detail });
    }

    if (resource === "restaurants") {
      return NextResponse.json({ data: await listSuperAdminRestaurants() });
    }

    if (resource === "subscriptions") {
      return NextResponse.json({ data: await listSuperAdminSubscriptions() });
    }

    if (resource === "payments") {
      return NextResponse.json({ data: await listSuperAdminPayments() });
    }

    if (resource === "plans") {
      return NextResponse.json({ data: await getSuperAdminPlan() });
    }

    if (resource === "settings") {
      return NextResponse.json({ data: await getPlatformSettings() });
    }

    if (resource === "audit-logs") {
      return NextResponse.json({ data: await listSuperAdminAuditLogs() });
    }

    return NextResponse.json({ error: "Kaynak bulunamadi." }, { status: 404 });
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  return withSuperAdmin(request, async (admin) => {
    const path = getPath(context);
    const [resource, id] = path;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";

    if (resource === "users" && id) {
      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          memberships: {
            include: { restaurant: { select: { id: true, name: true } } },
          },
        },
      });

      if (!user) return NextResponse.json({ error: "Kullanici bulunamadi." }, { status: 404 });

      if (action === "reactivate") {
        await prisma.user.update({
          where: { id },
          data: { isActive: true, deactivatedAt: null, deletedAt: null },
        });
      } else if (action === "delete") {
        await prisma.user.update({
          where: { id },
          data: { isActive: false, deactivatedAt: new Date(), deletedAt: new Date() },
        });
      } else {
        await prisma.user.update({
          where: { id },
          data: { isActive: false, deactivatedAt: new Date() },
        });
      }

      await writeSuperAdminAuditLog({
        adminId: admin.id,
        action: action === "delete" ? "delete_user" : action === "reactivate" ? "reactivate_user" : "deactivate_user",
        entityType: "user",
        entityId: id,
        metadata: {
          email: user.email,
          isOwner: user.memberships.some((membership) => membership.role === "OWNER"),
          restaurants: user.memberships.map((membership) => membership.restaurant.name),
          softDelete: action === "delete",
        },
      });

      return NextResponse.json({ data: { ok: true } });
    }

    if (resource === "restaurants" && id) {
      const restaurant = await prisma.restaurant.findUnique({ where: { id } });
      if (!restaurant) return NextResponse.json({ error: "Restoran bulunamadi." }, { status: 404 });

      if (action === "suspend") {
        await prisma.restaurant.update({ where: { id }, data: { status: "SUSPENDED" } });
      } else if (action === "reactivate") {
        await prisma.restaurant.update({ where: { id }, data: { status: "ACTIVE", workspaceMode: "LIVE" } });
      } else if (action === "reset_trial") {
        await resetRestaurantTrial(id);
      } else if (action === "expire_trial") {
        await expireRestaurantTrial(id);
      } else if (action === "activate_pro") {
        await activateRestaurantPro(id);
      } else if (action === "change_owner") {
        const ownerEmail = typeof body.ownerEmail === "string" ? body.ownerEmail.trim().toLowerCase() : "";
        if (!ownerEmail) {
          return NextResponse.json({ error: "Yeni sahip e-postasi gerekli." }, { status: 400 });
        }

        const user = await prisma.user.findUnique({ where: { email: ownerEmail } });
        if (!user || user.deletedAt) {
          return NextResponse.json({ error: "Aktif kullanici bulunamadi." }, { status: 404 });
        }

        await prisma.$transaction(async (tx) => {
          await tx.membership.updateMany({
            where: { restaurantId: id, role: "OWNER" },
            data: { role: "ADMIN" },
          });
          await tx.membership.upsert({
            where: { restaurantId_userId: { restaurantId: id, userId: user.id } },
            update: { role: "OWNER", status: "ACTIVE" },
            create: { restaurantId: id, userId: user.id, role: "OWNER", status: "ACTIVE" },
          });
        });
      } else {
        return NextResponse.json({ error: "Gecersiz islem." }, { status: 400 });
      }

      await writeSuperAdminAuditLog({
        adminId: admin.id,
        action: actionLabel(action),
        entityType: "restaurant",
        entityId: id,
        metadata: { restaurantName: restaurant.name, ownerEmail: body.ownerEmail ?? null },
      });

      return NextResponse.json({ data: { ok: true } });
    }

    if (resource === "subscriptions" && id) {
      const subscription = await prisma.tenantSubscription.findUnique({
        where: { id },
        include: { restaurant: true },
      });
      if (!subscription) return NextResponse.json({ error: "Abonelik bulunamadi." }, { status: 404 });

      if (action === "force_active_pro") {
        await activateRestaurantPro(subscription.restaurantId);
      } else if (action === "reset_trial") {
        await resetRestaurantTrial(subscription.restaurantId);
      } else if (action === "expire_trial") {
        await expireRestaurantTrial(subscription.restaurantId);
      } else if (action === "set_past_due") {
        await prisma.tenantSubscription.update({ where: { id }, data: { status: "PAST_DUE" } });
        await prisma.restaurant.update({ where: { id: subscription.restaurantId }, data: { status: "PAST_DUE" } });
      } else if (action === "cancel") {
        await prisma.tenantSubscription.update({
          where: { id },
          data: { status: "CANCELLED", cancelAtPeriodEnd: true, autoRenew: false },
        });
        await prisma.restaurant.update({ where: { id: subscription.restaurantId }, data: { status: "CANCELLED" } });
      } else {
        return NextResponse.json({ error: "Gecersiz islem." }, { status: 400 });
      }

      await writeSuperAdminAuditLog({
        adminId: admin.id,
        action: action === "cancel" ? "cancel_subscription" : actionLabel(action),
        entityType: "subscription",
        entityId: id,
        metadata: { restaurantId: subscription.restaurantId, restaurantName: subscription.restaurant.name },
      });

      return NextResponse.json({ data: { ok: true } });
    }

    if (resource === "plans") {
      const plan = await ensureProPlan();
      const settings = await getPlatformSettings();
      const monthlyPrice = typeof body.monthlyPrice === "string" ? body.monthlyPrice : plan.monthlyPrice.toString();
      const trialDays = Number(body.trialDays ?? settings.trialDurationDays);
      const trialEnabled = Boolean(body.trialEnabled);
      const isActive = Boolean(body.isActive);

      await prisma.subscriptionPlan.update({
        where: { id: plan.id },
        data: {
          monthlyPrice,
          isActive,
        },
      });
      await savePlatformSettings({
        ...settings,
        trialDurationDays: Number.isFinite(trialDays) && trialDays >= 0 ? Math.trunc(trialDays) : settings.trialDurationDays,
        trialEnabled,
      });

      await writeSuperAdminAuditLog({
        adminId: admin.id,
        action: "update_plan_price",
        entityType: "subscription_plan",
        entityId: plan.id,
        metadata: { monthlyPrice, trialDays, trialEnabled, isActive },
      });

      return NextResponse.json({ data: { ok: true } });
    }

    if (resource === "settings") {
      const existing = await getPlatformSettings();
      const nextSettings: PlatformSettings = {
        ...DEFAULT_PLATFORM_SETTINGS,
        ...existing,
        supportEmail: typeof body.supportEmail === "string" ? body.supportEmail : existing.supportEmail,
        companyName: typeof body.companyName === "string" ? body.companyName : existing.companyName,
        iyzicoMode: body.iyzicoMode === "live" ? "live" : "test",
        defaultCurrency: "TRY",
        trialDurationDays: Number.isFinite(Number(body.trialDurationDays))
          ? Math.max(0, Math.trunc(Number(body.trialDurationDays)))
          : existing.trialDurationDays,
        trialEnabled: Boolean(body.trialEnabled),
        maintenanceMode: Boolean(body.maintenanceMode),
      };

      await savePlatformSettings(nextSettings);
      await writeSuperAdminAuditLog({
        adminId: admin.id,
        action: "update_platform_settings",
        entityType: "platform_settings",
        entityId: "platform",
        metadata: nextSettings,
      });

      return NextResponse.json({ data: { ok: true } });
    }

    return NextResponse.json({ error: "Kaynak bulunamadi." }, { status: 404 });
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  return withSuperAdmin(request, async (admin) => {
    const path = getPath(context);
    const [resource, id, childResource, childId] = path;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const force = Boolean(body.force);

    if (resource === "users" && id) {
      const patchRequest = new Request(request.url, {
        method: "PATCH",
        headers: request.headers,
        body: JSON.stringify({ action: "delete" }),
      });

      return PATCH(patchRequest, context);
    }

    if (resource === "restaurants" && id && childResource === "tables" && childId) {
      const table = await prisma.table.findUnique({
        where: { id: childId },
        include: { branch: { select: { id: true, name: true, restaurantId: true } } },
      });

      if (!table || table.branch.restaurantId !== id) {
        return NextResponse.json({ error: "Masa bulunamadi." }, { status: 404 });
      }

      const deleted = await deleteTable({ id: childId, force });

      await writeSuperAdminAuditLog({
        adminId: admin.id,
        action: "delete_table",
        entityType: "table",
        entityId: childId,
        metadata: {
          restaurantId: id,
          branchId: table.branch.id,
          branchName: table.branch.name,
          tableName: table.name,
          force,
        },
      });

      return NextResponse.json({ data: deleted });
    }

    if (resource === "restaurants" && id && childResource === "branches" && childId) {
      const branch = await prisma.branch.findUnique({
        where: { id: childId },
        select: {
          id: true,
          restaurantId: true,
          name: true,
          _count: {
            select: {
              tables: true,
              menuItems: true,
              sessions: true,
            },
          },
        },
      });

      if (!branch || branch.restaurantId !== id) {
        return NextResponse.json({ error: "Branch bulunamadi." }, { status: 404 });
      }

      const deleted = await deleteBranch({ id: childId, force });

      await writeSuperAdminAuditLog({
        adminId: admin.id,
        action: "delete_branch",
        entityType: "branch",
        entityId: childId,
        metadata: {
          restaurantId: id,
          branchName: branch.name,
          tablesCount: branch._count.tables,
          menuItemsCount: branch._count.menuItems,
          sessionsCount: branch._count.sessions,
          force,
        },
      });

      return NextResponse.json({ data: deleted });
    }

    return NextResponse.json({ error: "Kaynak bulunamadi." }, { status: 404 });
  });
}
