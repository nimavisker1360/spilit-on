export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { createMenuItem, deleteMenuItem, updateMenuItem } from "@/features/menu/menu.service";
import { routeErrorMessage } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const item = await createMenuItem(json);
    return NextResponse.json({ data: item }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const json = await request.json();
    const item = await updateMenuItem(json);
    return NextResponse.json({ data: item });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const json = await request.json();
    const item = await deleteMenuItem(json);
    return NextResponse.json({ data: item });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
