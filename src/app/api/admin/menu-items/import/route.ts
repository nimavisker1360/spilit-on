export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { importMenuItems } from "@/features/menu/menu.service";
import { routeErrorMessage } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const result = await importMenuItems(json);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
