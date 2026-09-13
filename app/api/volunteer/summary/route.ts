export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireVolunteer, UnauthorizedError } from "@/src/server/auth/session";
import { getCycleSummary } from "@/src/server/volunteer/queries";

export async function GET() {
  try {
    await requireVolunteer();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    throw err;
  }

  const summary = await getCycleSummary();
  return NextResponse.json(summary);
}
