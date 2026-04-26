export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getActiveSessionByTableCode } from "@/features/session/session.service";
import { getTableByCode } from "@/features/table/table.service";
import { routeErrorMessage } from "@/lib/errors";
import { emitRealtimeEvent } from "@/lib/realtime/server";

export async function POST(
  request: Request,
  context: {
    params: {
      tableCode: string;
    };
  }
) {
  try {
    void request;

    const tableCode = context.params.tableCode;
    const table = await getTableByCode(tableCode);

    if (!table || table.status === "OUT_OF_SERVICE") {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    const session = await getActiveSessionByTableCode(tableCode);

    emitRealtimeEvent({
      type: "guest.qr-opened",
      tableCode: table.code,
      branchId: table.branchId,
      sessionId: session?.id ?? null
    });

    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
