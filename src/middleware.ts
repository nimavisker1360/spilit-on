import { auth } from "@/auth";
import { isDemoAuthEnabled } from "@/lib/demo-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

export default auth((req: NextRequest & { auth: unknown }) => {
  const { pathname } = req.nextUrl;
  const demoAuthEnabled = isDemoAuthEnabled();

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
