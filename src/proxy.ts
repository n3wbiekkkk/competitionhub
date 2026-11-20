import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const user = session?.user ?? null;

  const isProtectedUserRoute =
    pathname === "/profile" ||
    pathname.startsWith("/profile/") ||
    pathname === "/my-teams" ||
    pathname.startsWith("/my-teams/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/people" ||
    pathname.startsWith("/people/");

  if (isProtectedUserRoute && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isProtectedAdminRoute =
    pathname === "/teacher" ||
    pathname.startsWith("/teacher/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/");

  if (isProtectedAdminRoute) {
    if (!user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (user.role !== "teacher") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // The login page checks the live profile instead of trusting a stale JWT.

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
