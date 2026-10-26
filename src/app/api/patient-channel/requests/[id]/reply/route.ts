import { NextRequest, NextResponse } from "next/server";
import { REPLY_MAX } from "@/lib/patientChannel/inbox";
import { pcBody, pcCaller, pcFail } from "@/lib/patientChannel/server";

export const runtime = "nodejs";
export const preferredRegion = "gru1";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/patient-channel/requests/[id]/reply {text, callBack?} (specs/patient-contact-tech.md
// §4.7, M5): the doctor or a secretary in scope answers and closes a request through 237's
// pc_reply, AS THE CALLER (its scope check is the gate: a secretary can't answer a
// doctor-destination request, 01's call 10). The reply is at most 500 characters (the spec;
// the database allows 1000). pc_reply is idempotent: the same answer twice is one reply,
// and a closed request answers 409 not_open, so a double click never sends twice.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, db } = await pcCaller(request).catch(() => ({ user: null, db: null }));
  if (!user || !db) return pcFail("unauthorized", 401);
  if (!UUID.test(id)) return pcFail("bad_request", 400);

  // Read under RLS: a request the caller can't read is 404, the same as one that doesn't exist.
  // No flag gate: staff answer requests already sent even after a switch-off (01, 10-26).
  const { data: row } = await db.from("pc_requests").select("professional_id").eq("id", id).maybeSingle();
  if (!(row as { professional_id?: string } | null)?.professional_id) return pcFail("not_found", 404);

  const body = await pcBody<{ text?: unknown; callBack?: unknown }>(request, 8 * 1024);
  if (body === "too_large") return pcFail("too_large", 413);
  if (!body) return pcFail("bad_request", 400);
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const callBack = body.callBack === true;
  if (text.length > REPLY_MAX || (!text && !callBack)) return pcFail("invalid_reply", 422);

  const { data, error } = await db.rpc("pc_reply", { p_request_id: id, p_text: text, p_call_back: callBack });
  if (!error) {
    const d = data as { id: string; status: string };
    return NextResponse.json({ id: d.id, status: d.status });
  }
  const m = error.message ?? "";
  if (m.includes("out_of_scope")) return pcFail("out_of_scope", 403);
  if (m.includes("not_open")) return pcFail("not_open", 409);
  if (m.includes("not_found")) return pcFail("not_found", 404);
  if (m.includes("empty_reply") || m.includes("too_long")) return pcFail("invalid_reply", 422);
  return pcFail("failed", 500);
}
