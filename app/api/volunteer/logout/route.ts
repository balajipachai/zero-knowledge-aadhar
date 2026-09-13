export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getVolunteerSession } from "@/src/server/auth/session";
import { revokeVolunteerSession } from "@/src/server/auth/volunteerSessions";
import { originMatchesApp } from "@/src/server/auth/originCheck";

export async function POST(request: Request) {
  if (!originMatchesApp(request)) {
    return NextResponse.json({ error: "ORIGIN_MISMATCH" }, { status: 403 });
  }

  const session = await getVolunteerSession();
  // Revoke the server-side row FIRST -- this is what actually invalidates
  // the session (a copy of the cookie captured before logout, or replayed
  // after, can no longer validate). Destroying the cookie only clears this
  // client's own copy.
  if (session.sessionId) {
    await revokeVolunteerSession(session.sessionId);
  }
  session.destroy();
  return NextResponse.json({ ok: true });
}
