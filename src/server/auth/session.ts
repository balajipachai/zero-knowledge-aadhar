import { cookies } from "next/headers";
import { getIronSession, type IronSession } from "iron-session";
import { getConfig } from "../config";
import { validateAndTouchVolunteerSession } from "./volunteerSessions";

/** The cookie carries only an opaque server-side session row id.
 * volunteerId/email are looked up from `volunteer_sessions` (joined to
 * `volunteers`) on every request instead of being trusted from the sealed
 * cookie payload -- this is what makes logout an actual revocation rather
 * than just clearing the client's own cookie (see
 * src/server/auth/volunteerSessions.ts). */
export type VolunteerSessionData = {
  sessionId?: string;
};

const COOKIE_NAME = "zk_aadhaar_volunteer_session";
const EIGHT_HOURS_SECONDS = 8 * 60 * 60;

export async function getVolunteerSession(): Promise<
  IronSession<VolunteerSessionData>
> {
  const cfg = getConfig();
  return getIronSession<VolunteerSessionData>(await cookies(), {
    cookieName: COOKIE_NAME,
    password: cfg.sessionSecret,
    ttl: EIGHT_HOURS_SECONDS,
    cookieOptions: {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: EIGHT_HOURS_SECONDS,
    },
  });
}

/** The cookie's `ttl`/`maxAge` above are a coarse belt-and-braces expiry;
 * the actual 8h-absolute/30min-idle enforcement -- and revocability -- is
 * the DB row `validateAndTouchVolunteerSession` checks and slides. */
export async function requireVolunteer(): Promise<{
  volunteerId: string;
  email: string;
}> {
  const session = await getVolunteerSession();
  if (!session.sessionId) {
    throw new UnauthorizedError();
  }
  const validated = await validateAndTouchVolunteerSession(session.sessionId);
  if (!validated) {
    throw new UnauthorizedError();
  }
  return validated;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}
