export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { joinSession } from "@/features/session/session.service";
import { routeErrorMessage } from "@/lib/errors";
import { emitRealtimeEvent } from "@/lib/realtime/server";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const result = await joinSession(json);

    if (result.created) {
      emitRealtimeEvent({
        type: "session.guest-joined",
        sessionId: result.session.id,
        branchId: result.session.branchId,
        tableCode: result.session.table.code,
        guestId: result.guest.id
      });
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
