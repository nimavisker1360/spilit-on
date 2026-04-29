import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";

export const SUPER_ADMIN_COOKIE_NAME = "mp_super_admin_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

export type SuperAdminSessionPayload = {
  adminId: string;
  email: string;
  exp: number;
};

export type SuperAdminContext = {
  id: string;
  email: string;
  name: string;
  role: string;
};

function getSessionSecret(): string {
  const secret = process.env.SUPER_ADMIN_SESSION_SECRET || process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error("SUPER_ADMIN_SESSION_SECRET or AUTH_SECRET is required for super admin sessions.");
  }

  return secret;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("base64url");
}

export function createSuperAdminSessionToken(input: { adminId: string; email: string }): string {
  const payload: SuperAdminSessionPayload = {
    adminId: input.adminId,
    email: input.email,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifySuperAdminSessionToken(token?: string | null): SuperAdminSessionPayload | null {
  if (!token) return null;

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) return null;

  const expectedSignature = signPayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SuperAdminSessionPayload;

    if (!payload.adminId || !payload.email || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

export function setSuperAdminSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SUPER_ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSuperAdminSessionCookie(response: NextResponse) {
  response.cookies.set(SUPER_ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getSuperAdminFromRequest(request?: NextRequest | Request): Promise<SuperAdminContext | null> {
  const token =
    request instanceof Request
      ? request.headers
          .get("cookie")
          ?.split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith(`${SUPER_ADMIN_COOKIE_NAME}=`))
          ?.slice(SUPER_ADMIN_COOKIE_NAME.length + 1)
      : cookies().get(SUPER_ADMIN_COOKIE_NAME)?.value;

  const payload = verifySuperAdminSessionToken(token);

  if (!payload) return null;

  const admin = await prisma.superAdminUser.findUnique({
    where: { id: payload.adminId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
    },
  });

  if (!admin || !admin.isActive || admin.email !== payload.email) return null;

  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  };
}

export async function requireSuperAdmin(request?: NextRequest | Request): Promise<SuperAdminContext> {
  const admin = await getSuperAdminFromRequest(request);

  if (!admin) {
    throw new Error("SUPER_ADMIN_UNAUTHENTICATED");
  }

  return admin;
}

export async function requireSuperAdminPage(): Promise<SuperAdminContext> {
  const admin = await getSuperAdminFromRequest();

  if (!admin) {
    redirect("/super-admin/login");
  }

  return admin;
}

export function superAdminUnauthorizedResponse() {
  return NextResponse.json({ error: "Super admin login required." }, { status: 401 });
}

export async function writeSuperAdminAuditLog(input: {
  adminId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: unknown;
}) {
  await prisma.adminAuditLog.create({
    data: {
      adminId: input.adminId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata === undefined ? undefined : (input.metadata as object),
    },
  });
}
