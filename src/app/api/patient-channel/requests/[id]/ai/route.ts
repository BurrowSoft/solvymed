import { NextRequest, NextResponse } from "next/server";
import { aiConfirm, aiUndo } from "@/lib/patientChannel/aiDb";
import { pcBody, pcCaller, pcFail } from "@/lib/patientChannel/server";

export const runtime = "nodejs";
export const preferredRegion = "gru1";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/patient-channel/requests/[id]/ai {action: "confirm" | "undo"} (M7 contract §3): the
// doctor's Confirmar (the AI lines stay, marked confirmed; the patient's answers are never
// rewritten) or Desfazer (the keyword score back exactly, the AI lines deleted). AS THE CALLER:
// the RPCs refuse anyone but the practice's doctor (secretaries read the lines, never act on
// them). Both only from a finished reading ('done'): anything else is 409 ai_not_done, so a
// double click never acts twice.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, db } = await pcCaller(request).catch(() => ({ user: null, db: null }));
  if (!user || !db) return pcFail("unauthorized", 401);
  if (!UUID.test(id)) return pcFail("bad_request", 400);

  const body = await pcBody<{ action?: unknown }>(request, 1024);
  if (body === "too_large") return pcFail("too_large", 413);
  const action = body?.action;
  if (action !== "confirm" && action !== "undo") return pcFail("bad_request", 400);

  // Read under RLS: a request the caller can't read is 404, the same as one that doesn't exist.
  const { data: row } = await db.from("pc_requests").select("professional_id").eq("id", id).maybeSingle();
  if (!(row as { professional_id?: string } | null)?.professional_id) return pcFail("not_found", 404);

  try {
    const ok = action === "confirm" ? await aiConfirm(db, id) : await aiUndo(db, id);
    return ok ? NextResponse.json({ ok: true }) : pcFail("ai_not_done", 409);
  } catch (e) {
    // A secretary, another practice or an unknown id: 42501 'forbidden' (the M7 contract §4b).
    const { code, message } = e as { code?: string; message?: string };
    if (code === "42501" || (message ?? "").includes("forbidden")) return pcFail("not_doctor", 403);
    return pcFail("failed", 500);
  }
}
