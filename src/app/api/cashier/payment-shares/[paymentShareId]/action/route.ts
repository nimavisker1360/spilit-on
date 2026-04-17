export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";

import { applyCashierPaymentShareAction } from "@/features/payment/payment.service";
import { cashierPaymentShareActionSchema } from "@/features/payment/payment.schemas";
import { routeErrorMessage } from "@/lib/errors";

const bodySchema = z
  .object({
    action: cashierPaymentShareActionSchema
  })
  .strict();

type RouteContext = {
  params: {
    paymentShareId: string;
  };
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const json = await request.json();
    const parsed = bodySchema.parse(json);
    const result = await applyCashierPaymentShareAction(context.params.paymentShareId, parsed.action);
    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
