import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth/session";
import { isAllowedMutationOrigin } from "@/lib/auth/csrf";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const withRequestId = (response: NextResponse) => {
    response.headers.set("X-Request-Id", requestId);
    return response;
  };

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const user = session?.user ?? null;

  if (
    pathname.startsWith("/api/") &&
    !SAFE_METHODS.has(request.method.toUpperCase()) &&
    token &&
    !isAllowedMutationOrigin(request)
  ) {
    return withRequestId(
      NextResponse.json(
        { error: "คำขอไม่ผ่านการตรวจสอบแหล่งที่มา" },
        { status: 403 },
      ),
    );
  }

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
    return withRequestId(NextResponse.redirect(loginUrl));
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
      return withRequestId(NextResponse.redirect(loginUrl));
    }
    if (user.role !== "teacher") {
      return withRequestId(NextResponse.redirect(new URL("/", request.url)));
    }
  }

  // The login page checks the live profile instead of trusting a stale JWT.
  return withRequestId(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
