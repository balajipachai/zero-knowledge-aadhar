export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { submitApplicationSchema } from "@/src/server/intake/schema";
import { submitApplication } from "@/src/server/intake/submit";
import { checkRateLimit, clientIpFromHeaders } from "@/src/server/rateLimit";
import { assertChainInvariantsOk } from "@/src/server/boot";

const REJECTION_STATUS: Record<string, number> = {
  DRAFT_NOT_FOUND: 404,
  DRAFT_ALREADY_SUBMITTED: 409,
  DRAFT_EXPIRED: 410,
  CYCLE_NOT_OPEN: 409,
  WRONG_SEED: 400,
  WRONG_PUBKEY_HASH: 400,
  OVER_DISCLOSURE: 400,
  SIGNAL_MISMATCH: 400,
  INVALID_PROOF: 400,
  NOT_ELIGIBLE: 403,
  DUPLICATE: 409,
};

/**
 * The recording path. This route (and only this route, via
 * src/server/intake/submit.ts) verifies the proof server-side before
 * anything is recorded -- it never trusts a validity flag from the client,
 * because the request body's zod schema has no field for one to arrive in.
 */
export async function POST(request: Request) {
  const invariants = await assertChainInvariantsOk();
  if (!invariants.ok) {
    console.error("recording refused: chain invariants do not hold", {
      reason: invariants.reason,
    });
    return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });
  }

  const ip = clientIpFromHeaders(request.headers);
  const rateLimit = await checkRateLimit("applications", ip);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = submitApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  try {
    const result = await submitApplication(parsed.data);
    if (!result.ok) {
      console.info("application rejected", { reason: result.reason });
      return NextResponse.json(
        { error: result.reason },
        { status: REJECTION_STATUS[result.reason] ?? 400 },
      );
    }
    return NextResponse.json(
      {
        applicationId: result.applicationId,
        anchorStatus: result.anchorStatus,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("application submission failed", {
      reason: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
