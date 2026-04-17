export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { createPaymentSessionFromInvoice } from "@/features/payment/payment.service";
import { routeErrorMessage } from "@/lib/errors";

type RouteContext = {
  params: {
    invoiceId: string;
  };
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const result = await createPaymentSessionFromInvoice(context.params.invoiceId);
    return NextResponse.json({ data: result }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
