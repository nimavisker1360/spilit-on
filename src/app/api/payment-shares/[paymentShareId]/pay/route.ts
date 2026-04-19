export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";

import { applyGuestPaymentSharePayment } from "@/features/payment/payment.service";
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

export async function POST(request: Request, context: RouteContext) {
  try {
    const parsed = bodySchema.parse(await request.json());
    const result = await applyGuestPaymentSharePayment({
      paymentShareId: context.params.paymentShareId,
      ...parsed
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
