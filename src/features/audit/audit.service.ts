import type { AccessContext } from "@/features/auth/auth.types";
import { currentTimestamp, makeId, updateStore } from "@/lib/local-store";
import type { JsonValue } from "@/features/payment/payment.types";

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
  if (!request) {
    return null;
  }

  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

function toJsonValue(value: unknown): JsonValue | null {
  if (value === undefined) {
    return null;
  }

  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export async function recordAuditLog(input: RecordAuditLogInput) {
  return updateStore((store) => {
    const auditLog = {
      id: makeId("audit"),
      restaurantId: input.context.restaurantId,
      branchId: input.branchId ?? null,
      actorType: input.context.actorType,
      actorUserId: input.context.userId,
      actorRole: input.context.role,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: toJsonValue(input.before),
      after: toJsonValue(input.after),
      metadata: toJsonValue(input.metadata),
      ipAddress: requestIpAddress(input.request),
      userAgent: input.request?.headers.get("user-agent") ?? null,
      createdAt: currentTimestamp()
    };

    store.auditLogs.push(auditLog);

    return auditLog;
  });
}
