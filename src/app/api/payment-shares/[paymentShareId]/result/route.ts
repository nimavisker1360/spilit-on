export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getIyzicoPaymentResultForShare } from "@/features/payment/iyzico-payment.service";
import { routeErrorMessage } from "@/lib/errors";

type RouteContext = {
  params: {
    paymentShareId: string;
  };
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const result = await getIyzicoPaymentResultForShare(context.params.paymentShareId);
    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
