export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";

import { applyMockPaymentLinkAction } from "@/features/payment/payment.service";
import { routeErrorMessage } from "@/lib/errors";

const bodySchema = z
  .object({
    action: z.enum(["COMPLETE", "FAIL"])
  })
  .strict();

type RouteContext = {
  params: {
    paymentShareId: string;
  };
};

function getTokenFromRequest(request: Request) {
  const token = new URL(request.url).searchParams.get("token");

  if (!token) {
    throw new Error("Mock payment token is required.");
  }

  return token;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const token = getTokenFromRequest(request);
    const parsed = bodySchema.parse(await request.json());
    const result = await applyMockPaymentLinkAction(context.params.paymentShareId, token, parsed.action);
    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
