import { auth } from "@/auth";
import { isDemoAuthEnabled } from "@/lib/demo-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SUPER_ADMIN_COOKIE_NAME = "mp_super_admin_session";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/api/auth",
  "/table",
  "/guest",
  "/pay",
  "/api/guest",
  "/api/payment-links",
  "/api/payment-shares",
  "/api/payments",
  "/api/sessions/join",
  "/api/orders/customer",
  "/_next",
  "/icons",
  "/manifest",
  "/sw.js",
  "/favicon",
];

const PUBLIC_FILE_PATTERN = /\.(?:avif|gif|ico|jpg|jpeg|mp4|png|svg|webm|webp)$/i;

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_FILE_PATTERN.test(pathname) || PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function verifySuperAdminCookie(token?: string): Promise<boolean> {
  if (!token) return false;

  const secret = process.env.SUPER_ADMIN_SESSION_SECRET || process.env.AUTH_SECRET;
  if (!secret) return false;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expectedSignature = bytesToBase64Url(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encodedPayload))
  );

  if (signature !== expectedSignature) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encodedPayload))) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp >= Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export default auth(async (req: NextRequest & { auth: unknown }) => {
  const { pathname } = req.nextUrl;
  const demoAuthEnabled = isDemoAuthEnabled();

  if (pathname.startsWith("/super-admin") || pathname.startsWith("/api/super-admin")) {
    const isLoginPath = pathname === "/super-admin/login" || pathname === "/api/super-admin/auth/login";
    const isLogoutPath = pathname === "/api/super-admin/auth/logout";
    const isAuthenticated = await verifySuperAdminCookie(req.cookies.get(SUPER_ADMIN_COOKIE_NAME)?.value);

    if (isLoginPath) {
      if (pathname === "/super-admin/login" && isAuthenticated) {
        return NextResponse.redirect(new URL("/super-admin", req.url));
      }

      return NextResponse.next();
    }

    if (!isAuthenticated && !isLogoutPath) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Super admin login required." }, { status: 401 });
      }

      const loginUrl = new URL("/super-admin/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  if (demoAuthEnabled && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  if (isPublicPath(pathname)) return NextResponse.next();

  const session = (req as {
    auth?: {
      user?: { id?: string };
    };
  }).auth;

  if (demoAuthEnabled) {
    return NextResponse.next();
  }

  if (!session?.user?.id) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest|sw.js).*)",
  ],
};
