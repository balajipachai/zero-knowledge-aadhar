export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { intakeDraftSchema } from "@/src/server/intake/schema";
import { createDraft } from "@/src/server/intake/draft";
import { checkRateLimit, clientIpFromHeaders } from "@/src/server/rateLimit";
import { assertChainInvariantsOk } from "@/src/server/boot";

export async function POST(request: Request) {
  const invariants = await assertChainInvariantsOk();
  if (!invariants.ok) {
    console.error("intake refused: chain invariants do not hold", {
      reason: invariants.reason,
    });
    return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 });
  }

  const ip = clientIpFromHeaders(request.headers);
  const rateLimit = await checkRateLimit("intake", ip);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = intakeDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const draft = await createDraft(parsed.data);
    return NextResponse.json(draft, { status: 201 });
  } catch (err) {
    console.error("intake draft creation failed", {
      reason: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
