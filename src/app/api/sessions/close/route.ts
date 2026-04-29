export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { recordAuditLog } from "@/features/audit/audit.service";
import { requireEntityPermission } from "@/features/auth/auth-context";
import { closeSession } from "@/features/session/session.service";
import { routeErrorMessage, routeErrorStatus } from "@/lib/errors";
import { emitRealtimeEvent } from "@/lib/realtime/server";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const context = await requireEntityPermission(request, "session.open", "session", String(json.sessionId ?? ""));
    const session = await closeSession(json);

    emitRealtimeEvent({
      type: "session.closed",
      sessionId: session.id,
      branchId: session.branchId,
      tableCode: session.table.code
    });

    await recordAuditLog({
      context,
      request,
      action: "session.close.manual",
      entityType: "tableSession",
      entityId: session.id,
      branchId: session.branchId,
      after: session
    });

    return NextResponse.json({ data: session });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}
