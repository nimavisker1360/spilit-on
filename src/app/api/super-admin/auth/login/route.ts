export const dynamic = "force-dynamic";

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import {
  createSuperAdminSessionToken,
  setSuperAdminSessionCookie,
  writeSuperAdminAuditLog,
} from "@/features/super-admin/session";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password ?? "";

  if (!email || !password) {
    return NextResponse.json({ error: "E-posta ve sifre gerekli." }, { status: 400 });
  }

  const admin = await prisma.superAdminUser.findUnique({
    where: { email },
  });

  if (!admin || !admin.isActive) {
    return NextResponse.json({ error: "Giris bilgileri gecersiz." }, { status: 401 });
  }

  const isValidPassword = await bcrypt.compare(password, admin.passwordHash);

  if (!isValidPassword) {
    return NextResponse.json({ error: "Giris bilgileri gecersiz." }, { status: 401 });
  }

  await prisma.superAdminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  await writeSuperAdminAuditLog({
    adminId: admin.id,
    action: "login",
    entityType: "super_admin_user",
    entityId: admin.id,
    metadata: { email: admin.email },
  });

  const response = NextResponse.json({
    data: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    },
  });

  setSuperAdminSessionCookie(
    response,
    createSuperAdminSessionToken({ adminId: admin.id, email: admin.email })
  );

  return response;
}
