import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "zk_aadhaar_volunteer_session";

/**
 * UX-level gate only: redirects a volunteer without a session cookie to the
 * login page before a page even renders. This is NOT the security
 * boundary -- every volunteer API route and server component independently
 * calls `requireVolunteer()` (src/server/auth/session.ts), which actually
 * unseals and validates the session. A request that skips this proxy
 * entirely (curl, a hand-crafted fetch) still hits that in-handler check.
 */
export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isVolunteerPage =
    pathname.startsWith("/volunteer") && pathname !== "/volunteer/login";

  if (isVolunteerPage && !request.cookies.get(SESSION_COOKIE)) {
    const loginUrl = new URL("/volunteer/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/volunteer/:path*"],
};
