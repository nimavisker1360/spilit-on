export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { listKitchenBoard } from "@/features/kitchen/kitchen.service";
import { routeErrorMessage } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId") || undefined;
    const tickets = await listKitchenBoard(branchId);
    return NextResponse.json({ data: tickets });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
