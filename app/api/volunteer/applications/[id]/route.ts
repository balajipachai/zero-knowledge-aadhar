export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVolunteer, UnauthorizedError } from "@/src/server/auth/session";
import { originMatchesApp } from "@/src/server/auth/originCheck";
import {
  getApplicationDetail,
  recordReviewAction,
} from "@/src/server/volunteer/queries";

const reviewActionSchema = z
  .object({
    action: z.enum(["shortlist", "reject", "award", "reopen", "note"]),
    note: z.string().trim().max(2000).optional(),
  })
  .strict();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireVolunteer();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    throw err;
  }

  const { id } = await params;
  const detail = await getApplicationDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json(detail);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!originMatchesApp(request)) {
    return NextResponse.json({ error: "ORIGIN_MISMATCH" }, { status: 403 });
  }

  let volunteer;
  try {
    volunteer = await requireVolunteer();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = reviewActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const { id } = await params;
  const result = await recordReviewAction({
    applicationId: id,
    volunteerId: volunteer.volunteerId,
    action: parsed.data.action,
    note: parsed.data.note,
  });

  if (!result.ok) {
    const status = result.reason === "NOT_FOUND" ? 404 : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return NextResponse.json({ ok: true });
}
