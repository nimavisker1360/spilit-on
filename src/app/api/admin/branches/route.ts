export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { createBranch, deleteBranch, updateBranch } from "@/features/restaurant/restaurant.service";
import { routeErrorMessage } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const branch = await createBranch(json);
    return NextResponse.json({ data: branch }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const json = await request.json();
    const branch = await updateBranch(json);
    return NextResponse.json({ data: branch });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const json = await request.json();
    const branch = await deleteBranch(json);
    return NextResponse.json({ data: branch });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
