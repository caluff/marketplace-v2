import { NextResponse, type NextRequest } from "next/server"

import {
  WEB_RESET_COOKIE,
  WEB_SESSION_COOKIE,
  WEB_VERIFICATION_CODE_COOKIE,
  isJwtExpired,
  packSecret,
  safeRedirectPath,
} from "@/lib/auth-utils"

const secureCookie = process.env.NODE_ENV === "production"

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (pathname === "/reset-password") {
    const token = request.nextUrl.searchParams.get("token")
    if (token) {
      const email = request.nextUrl.searchParams.get("email") ?? undefined
      const destination = request.nextUrl.clone()
      destination.searchParams.delete("token")
      destination.searchParams.delete("email")
      const response = NextResponse.redirect(destination)
      response.cookies.set(
        WEB_RESET_COOKIE,
        packSecret({ token, email }),
        {
          httpOnly: true,
          secure: secureCookie,
          sameSite: "strict",
          path: "/",
          maxAge: 15 * 60,
        },
      )
      return response
    }
  }

  if (pathname === "/verify-email") {
    const code = request.nextUrl.searchParams.get("code")
    if (code) {
      const destination = request.nextUrl.clone()
      destination.searchParams.delete("code")
      const response = NextResponse.redirect(destination)
      response.cookies.set(WEB_VERIFICATION_CODE_COOKIE, code, {
        httpOnly: true,
        secure: secureCookie,
        sameSite: "strict",
        path: "/",
        maxAge: 15 * 60,
      })
      return response
    }
  }

  if (pathname.startsWith("/account")) {
    const token = request.cookies.get(WEB_SESSION_COOKIE)?.value
    if (!token || isJwtExpired(token)) {
      const login = new URL("/login", request.url)
      login.searchParams.set("next", safeRedirectPath(`${pathname}${search}`, "/account"))
      if (token) login.searchParams.set("reason", "expired")
      const response = NextResponse.redirect(login)
      if (token) response.cookies.delete(WEB_SESSION_COOKIE)
      return response
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/account/:path*", "/reset-password", "/verify-email"],
}
