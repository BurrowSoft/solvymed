import { NextRequest, NextResponse } from "next/server";
import { patientChannelEnabled } from "@/lib/patientChannel/live";
import { UUID, accessStatus, patientPage } from "@/lib/patientChannel/practice";
import { pcAdmin, pcBody, pcCaller, pcFail } from "@/lib/patientChannel/server";
import { parseSelfServeItem, resolvedReportLive } from "@/lib/patientChannel/resolvedReport";

export const runtime = "nodejs";
export const preferredRegion = "gru1";

// POST /api/patient-channel/selfserve {profId, kind: 'faq_resolved' | 'auto_resolved'}
// (§4.7): "this answered my question" on the FAQ or an automatic message. A count only
// (237's pc_selfserve_counts: day + kind, no patient, no content), for the doctor's tiles.
// Item 43: with item {kind: 'faq' | 'auto_message', id} (the FAQ question opened last / the
// automatic message shown last), 272's pc_count_selfserve_item also counts that item per day
// (only if it is that practice's). Only while pc-resolved-items-live (the privacy text first);
// until then the item is ignored and the kind counts as before.
export async function POST(request: NextRequest) {
  const { user, db } = await pcCaller(request).catch(() => ({ user: null, db: null }));
  if (!user || !db) return pcFail("unauthorized", 401);
  if (!(await patientChannelEnabled(db, user.id))) return pcFail("not_found", 404);
  const body = await pcBody<{ profId?: unknown; kind?: unknown; item?: unknown }>(request, 1024);
  if (body === "too_large") return pcFail("too_large", 413);
  if (!body || typeof body.profId !== "string" || !UUID.test(body.profId) || (body.kind !== "faq_resolved" && body.kind !== "auto_resolved")) {
    return pcFail("bad_request", 400);
  }
  const item = resolvedReportLive() ? parseSelfServeItem(body.item, body.kind) : null;
  if (item === "bad") return pcFail("bad_request", 400);
  const access = await patientPage(db, body.profId);
  if (!access.ok) return pcFail(access.code, accessStatus(access.code));
  const { error } = item
    ? await pcAdmin().rpc("pc_count_selfserve_item", { p_prof: body.profId, p_kind: body.kind, p_item_kind: item.kind, p_item_id: item.id })
    : await pcAdmin().rpc("pc_count_selfserve", { p_prof: body.profId, p_kind: body.kind });
  if (error) return pcFail("failed", 500);
  return new NextResponse(null, { status: 204 });
}
