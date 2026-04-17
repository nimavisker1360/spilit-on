export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { listBranchMenu } from "@/features/menu/menu.service";
import { getActiveSessionByTableCode } from "@/features/session/session.service";
import { getTableByCode } from "@/features/table/table.service";
import { routeErrorMessage } from "@/lib/errors";

export async function GET(
  request: Request,
  context: {
    params: {
      tableCode: string;
    };
  }
) {
  try {
    const tableCode = context.params.tableCode;
    const table = await getTableByCode(tableCode);

    if (!table || table.status === "OUT_OF_SERVICE") {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    const session = await getActiveSessionByTableCode(tableCode);
    const menu = await listBranchMenu(table.branchId, { includeUnavailable: true });

    return NextResponse.json({
      data: {
        table,
        session,
        menu
      }
    });
  } catch (error) {
    return NextResponse.json({ error: routeErrorMessage(error) }, { status: 400 });
  }
}
