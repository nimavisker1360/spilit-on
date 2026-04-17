export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { createMenuCategory, deleteMenuCategory, updateMenuCategory } from "@/features/menu/menu.service";
import { routeErrorMessage } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const category = await createMenuCategory(json);
    return NextResponse.json({ data: category }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const json = await request.json();
    const category = await updateMenuCategory(json);
    return NextResponse.json({ data: category });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const json = await request.json();
    const category = await deleteMenuCategory(json);
    return NextResponse.json({ data: category });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
