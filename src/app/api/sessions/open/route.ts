export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { recordAuditLog } from "@/features/audit/audit.service";
import { requireEntityPermission } from "@/features/auth/auth-context";
import { openSession } from "@/features/session/session.service";
import { routeErrorMessage, routeErrorStatus } from "@/lib/errors";
import { emitRealtimeEvent } from "@/lib/realtime/server";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const context = await requireEntityPermission(request, "session.open", "tableCode", String(json.tableCode ?? ""));
    const result = await openSession(json);

    if (result.created && result.session) {
      emitRealtimeEvent({
        type: "session.opened",
        sessionId: result.session.id,
        branchId: result.session.branchId,
        tableCode: result.session.table.code
      });
      await recordAuditLog({
        context,
        request,
        action: "session.open",
        entityType: "tableSession",
        entityId: result.session.id,
        branchId: result.session.branchId,
        after: result.session
      });
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: routeErrorStatus(error) });
  }
}
