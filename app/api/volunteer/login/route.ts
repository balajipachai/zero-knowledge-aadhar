export const runtime = "nodejs";

import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/src/server/db/pool";
import { hashPassword, verifyPassword } from "@/src/server/auth/password";
import { getVolunteerSession } from "@/src/server/auth/session";
import { createVolunteerSessionRow } from "@/src/server/auth/volunteerSessions";
import { originMatchesApp } from "@/src/server/auth/originCheck";
import { checkRateLimit, clientIpFromHeaders } from "@/src/server/rateLimit";

const loginSchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(1),
  })
  .strict();

// Computed once, lazily, at module load rather than a fixed literal like
// "scrypt$00$00" -- that literal decodes to a 1-byte salt/hash, so scrypt
// derives a key over a tiny buffer and returns measurably faster than the
// real (64-byte) path, letting a timing attack distinguish "unknown email"
// from "wrong password". A real dummy hash of the same shape closes that
// gap; memoized so it isn't recomputed (and re-timed) per request.
let dummyHashPromise: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword(randomBytes(32).toString("hex"));
  }
  return dummyHashPromise;
}

export async function POST(request: Request) {
  if (!originMatchesApp(request)) {
    return NextResponse.json({ error: "ORIGIN_MISMATCH" }, { status: 403 });
  }

  const ip = clientIpFromHeaders(request.headers);
  const rateLimit = await checkRateLimit("volunteer-login", ip);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const { rows } = await getPool().query<{
    id: string;
    email: string;
    password_hash: string;
  }>(`SELECT id, email, password_hash FROM volunteers WHERE email = $1`, [
    parsed.data.email,
  ]);

  const volunteer = rows[0];
  // Constant-shape response either way: don't leak whether the email
  // exists via timing or a different error path.
  const validPassword = volunteer
    ? await verifyPassword(parsed.data.password, volunteer.password_hash)
    : await verifyPassword(parsed.data.password, await getDummyHash());

  if (!volunteer || !validPassword) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  const sessionId = await createVolunteerSessionRow(volunteer.id);
  const session = await getVolunteerSession();
  session.sessionId = sessionId;
  await session.save();

  return NextResponse.json({ email: volunteer.email });
}
