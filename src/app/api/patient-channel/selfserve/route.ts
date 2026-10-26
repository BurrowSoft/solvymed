import { NextRequest, NextResponse } from "next/server";
import { patientChannelEnabled } from "@/lib/patientChannel/live";
import { UUID, accessStatus, patientPage } from "@/lib/patientChannel/practice";
import { pcAdmin, pcBody, pcCaller, pcFail } from "@/lib/patientChannel/server";

export const runtime = "nodejs";
export const preferredRegion = "gru1";

// POST /api/patient-channel/selfserve {profId, kind: 'faq_resolved' | 'auto_resolved'}
// (§4.7): "this answered my question" on the FAQ or an automatic message. A count only
// (237's pc_selfserve_counts: day + kind, no patient, no content), for the doctor's tiles.
export async function POST(request: NextRequest) {
  const { user, db } = await pcCaller(request).catch(() => ({ user: null, db: null }));
  if (!user || !db) return pcFail("unauthorized", 401);
  if (!(await patientChannelEnabled(db, user.id))) return pcFail("not_found", 404);
  const body = await pcBody<{ profId?: unknown; kind?: unknown }>(request, 1024);
  if (body === "too_large") return pcFail("too_large", 413);
  if (!body || typeof body.profId !== "string" || !UUID.test(body.profId) || (body.kind !== "faq_resolved" && body.kind !== "auto_resolved")) {
    return pcFail("bad_request", 400);
  }
  const access = await patientPage(db, body.profId);
  if (!access.ok) return pcFail(access.code, accessStatus(access.code));
  const { error } = await pcAdmin().rpc("pc_count_selfserve", { p_prof: body.profId, p_kind: body.kind });
  if (error) return pcFail("failed", 500);
  return new NextResponse(null, { status: 204 });
}
