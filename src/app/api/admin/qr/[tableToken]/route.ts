export const dynamic = "force-dynamic";

import QRCode from "qrcode";

import { requireEntityPermission } from "@/features/auth/auth-context";
import { routeErrorMessage, routeErrorStatus } from "@/lib/errors";
import { getRequestPublicAppBaseUrl, getTablePublicUrl } from "@/lib/public-url";

export async function GET(
  request: Request,
  context: {
    params: {
      tableToken: string;
    };
  }
) {
  try {
    const tableToken = context.params.tableToken;
    await requireEntityPermission(request, "table.qr.read", "tableToken", tableToken);
    const url = getTablePublicUrl(tableToken, getRequestPublicAppBaseUrl(request));

    const svg = await QRCode.toString(url, {
      type: "svg",
      margin: 2,
      width: 300,
      errorCorrectionLevel: "M"
    });

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=300"
      }
    });
  } catch (error) {
    return new Response(routeErrorMessage(error), {
      status: routeErrorStatus(error),
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }
}
