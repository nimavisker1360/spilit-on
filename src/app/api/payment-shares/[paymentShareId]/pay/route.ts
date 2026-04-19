export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";

import { initializeCheckoutFormForShare } from "@/features/payment/iyzico-payment.service";
import { routeErrorMessage } from "@/lib/errors";

const bodySchema = z
  .object({
    userId: z.string().trim().min(1).nullable().optional(),
    guestId: z.string().trim().min(1).nullable().optional(),
    tip: z
      .string()
      .trim()
      .regex(/^\d+\.\d{2}$/)
      .default("0.00")
  })
  .strict();

type RouteContext = {
  params: {
    paymentShareId: string;
  };
};

function clientIpFromRequest(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip");
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const parsed = bodySchema.parse(await request.json());
    const result = await initializeCheckoutFormForShare(context.params.paymentShareId, {
      ...parsed,
      buyerIp: clientIpFromRequest(request)
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
