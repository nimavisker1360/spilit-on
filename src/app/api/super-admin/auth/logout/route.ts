export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  clearSuperAdminSessionCookie,
  getSuperAdminFromRequest,
  writeSuperAdminAuditLog,
} from "@/features/super-admin/session";

export async function POST(request: Request) {
  const admin = await getSuperAdminFromRequest(request);

  if (admin) {
    await writeSuperAdminAuditLog({
      adminId: admin.id,
      action: "logout",
      entityType: "super_admin_user",
      entityId: admin.id,
      metadata: { email: admin.email },
    });
  }

  const response = NextResponse.json({ data: { ok: true } });
  clearSuperAdminSessionCookie(response);
  return response;
}
