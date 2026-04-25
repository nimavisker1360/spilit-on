export const dynamic = "force-dynamic";

import QRCode from "qrcode";

import { requireEntityPermission } from "@/features/auth/auth-context";
import { routeErrorMessage, routeErrorStatus } from "@/lib/errors";
import { getRequestPublicAppBaseUrl, getTablePublicUrl } from "@/lib/public-url";

function resolveRequestedBaseUrl(request: Request): string | null {
  const requestedBaseUrl = new URL(request.url).searchParams.get("baseUrl")?.trim();
  if (!requestedBaseUrl) {
    return null;
  }

  try {
    return new URL(requestedBaseUrl).toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

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
    const baseUrl = resolveRequestedBaseUrl(request) ?? getRequestPublicAppBaseUrl(request);
    const url = getTablePublicUrl(tableToken, baseUrl);

    const svg = await QRCode.toString(url, {
      type: "svg",
      margin: 2,
      width: 300,
      errorCorrectionLevel: "M"
    });

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-store, max-age=0"
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
