export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireVolunteer, UnauthorizedError } from "@/src/server/auth/session";
import { listApplications } from "@/src/server/volunteer/queries";

const VALID_STATUSES = new Set([
  "awaiting_review",
  "shortlisted",
  "rejected",
  "awarded",
]);

export async function GET(request: Request) {
  try {
    await requireVolunteer();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    throw err;
  }

  const url = new URL(request.url);
  const reviewStatus = url.searchParams.get("reviewStatus") ?? undefined;
  if (reviewStatus && !VALID_STATUSES.has(reviewStatus)) {
    return NextResponse.json({ error: "INVALID_FILTER" }, { status: 400 });
  }

  const applications = await listApplications({ reviewStatus });
  return NextResponse.json({ applications });
}
