export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getGuestPaymentEntry } from "@/features/payment/payment.service";
import { routeErrorMessage } from "@/lib/errors";

type RouteContext = {
  params: {
    tableCode: string;
  };
};

const guestPaymentLookupSchema = z
  .object({
    guestId: z.string().trim().optional(),
    guestName: z.string().trim().optional(),
    sessionId: z.string().trim().optional()
  })
  .strict();

function readLookupFromSearchParams(request: Request) {
  const searchParams = new URL(request.url).searchParams;

  return guestPaymentLookupSchema.parse({
    guestId: searchParams.get("guestId") ?? undefined,
    guestName: searchParams.get("guestName") ?? undefined,
    sessionId: searchParams.get("sessionId") ?? undefined
  });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const result = await getGuestPaymentEntry(context.params.tableCode, readLookupFromSearchParams(request));

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = (await request.json()) as unknown;
    const result = await getGuestPaymentEntry(context.params.tableCode, guestPaymentLookupSchema.parse(body));

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
