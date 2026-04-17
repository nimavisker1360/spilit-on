export const dynamic = "force-dynamic";

import QRCode from "qrcode";

import { getTablePublicUrl } from "@/lib/public-url";

export async function GET(
  _request: Request,
  context: {
    params: {
      tableToken: string;
    };
  }
) {
  const tableToken = context.params.tableToken;
  const url = getTablePublicUrl(tableToken);

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
}
