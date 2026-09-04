import { NextResponse, type NextRequest } from "next/server";

import {
  ADMIN_RESET_COOKIE,
  ADMIN_SESSION_COOKIE,
  ADMIN_VERIFICATION_CODE_COOKIE,
  isJwtExpired,
  packSecret,
  safeRedirectPath,
} from "@/lib/auth-utils";

const secure = process.env.NODE_ENV === "production";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/reset-password") {
    const token = request.nextUrl.searchParams.get("token");
    if (token) {
      const responseUrl = request.nextUrl.clone();
      const email = responseUrl.searchParams.get("email") ?? undefined;
      responseUrl.searchParams.delete("token");
      responseUrl.searchParams.delete("email");
      const response = NextResponse.redirect(responseUrl);
      response.cookies.set(ADMIN_RESET_COOKIE, packSecret({ token, email }), {
        httpOnly: true,
        secure,
        sameSite: "strict",
        path: "/",
        maxAge: 900,
      });
      return response;
    }
  }

  if (pathname === "/verify-email") {
    const code = request.nextUrl.searchParams.get("code");
    if (code) {
      const responseUrl = request.nextUrl.clone();
      responseUrl.searchParams.delete("code");
      const response = NextResponse.redirect(responseUrl);
      response.cookies.set(ADMIN_VERIFICATION_CODE_COOKIE, code, {
        httpOnly: true,
        secure,
        sameSite: "strict",
        path: "/",
        maxAge: 900,
      });
      return response;
    }
  }

  if (pathname.startsWith("/dashboard")) {
    const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    if (!token || isJwtExpired(token)) {
      const login = new URL("/login", request.url);
      login.searchParams.set(
        "next",
        safeRedirectPath(`${pathname}${search}`, "/dashboard"),
      );
      if (token) login.searchParams.set("reason", "expired");
      const response = NextResponse.redirect(login);
      if (token) response.cookies.delete(ADMIN_SESSION_COOKIE);
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/reset-password", "/verify-email"],
};
