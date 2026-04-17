export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getMockPaymentLinkDetail } from "@/features/payment/payment.service";
import { routeErrorMessage } from "@/lib/errors";

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

export async function GET(request: Request, context: RouteContext) {
  try {
    const token = getTokenFromRequest(request);
    const result = await getMockPaymentLinkDetail(context.params.paymentShareId, token);
    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
