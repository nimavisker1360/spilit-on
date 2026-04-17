export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { createInvoice } from "@/features/cashier/cashier.service";
import { routeErrorMessage } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const invoice = await createInvoice(json);
    return NextResponse.json({ data: invoice }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
