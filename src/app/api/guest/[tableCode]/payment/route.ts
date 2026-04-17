export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getGuestPaymentEntry } from "@/features/payment/payment.service";
import { routeErrorMessage } from "@/lib/errors";

type RouteContext = {
  params: {
    tableCode: string;
  };
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const guestId = new URL(request.url).searchParams.get("guestId") ?? undefined;
    const result = await getGuestPaymentEntry(context.params.tableCode, guestId);

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
