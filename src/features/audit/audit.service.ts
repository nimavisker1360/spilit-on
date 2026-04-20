import { prisma } from "@/lib/prisma";
import type { AccessContext } from "@/features/auth/auth.types";

type RecordAuditLogInput = {
  context: AccessContext;
  action: string;
  entityType: string;
  entityId?: string | null;
  branchId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  request?: Request;
};

function requestIpAddress(request?: Request): string | null {
  if (!request) return null;
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

function toJson(value: unknown) {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}

export async function recordAuditLog(input: RecordAuditLogInput) {
  return prisma.auditLog.create({
    data: {
      restaurantId: input.context.restaurantId,
      branchId: input.branchId ?? null,
      actorType: input.context.actorType,
      actorUserId: input.context.userId,
      actorRole: input.context.role,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: toJson(input.before),
      after: toJson(input.after),
      metadata: toJson(input.metadata),
      ipAddress: requestIpAddress(input.request),
      userAgent: input.request?.headers.get("user-agent") ?? null,
    },
  });
}
