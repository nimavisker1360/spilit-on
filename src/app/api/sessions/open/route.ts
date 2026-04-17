export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { openSession } from "@/features/session/session.service";
import { routeErrorMessage } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const result = await openSession(json);
    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
