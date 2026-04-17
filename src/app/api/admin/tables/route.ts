export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { createTable, deleteTable, updateTable } from "@/features/table/table.service";
import { routeErrorMessage } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const table = await createTable(json);
    return NextResponse.json({ data: table }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const json = await request.json();
    const table = await updateTable(json);
    return NextResponse.json({ data: table });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const json = await request.json();
    const table = await deleteTable(json);
    return NextResponse.json({ data: table });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
