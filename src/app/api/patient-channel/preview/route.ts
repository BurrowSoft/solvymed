import { NextRequest, NextResponse } from "next/server";
import { patientChannelEnabled } from "@/lib/patientChannel/live";
import { UUID, accessStatus, patientPage, practiceReason, practiceRules } from "@/lib/patientChannel/practice";
import { checkAnswers, scoreForRequest } from "@/lib/patientChannel/requestScore";
import { pcAdmin, pcBody, pcCaller, pcFail } from "@/lib/patientChannel/server";

export const runtime = "nodejs";
export const preferredRegion = "gru1";

// POST /api/patient-channel/preview {profId, reasonId, answers} (specs/patient-contact-tech.md
// §4.7): while the patient fills the form, what they may see, scored on the server with
// the practice's rules: the red-band warning, the automatic messages and whether "I don't
// need to send" is offered. NEVER the total, the band or the lines (a patient never sees
// a score). Access is 237's own check (pc_patient_page as the patient).
export async function POST(request: NextRequest) {
  const { user, db } = await pcCaller(request).catch(() => ({ user: null, db: null }));
  if (!user || !db) return pcFail("unauthorized", 401);
  if (!(await patientChannelEnabled(db, user.id))) return pcFail("not_found", 404);

  const body = await pcBody<{ profId?: unknown; reasonId?: unknown; answers?: unknown }>(request, 8 * 1024);
  if (body === "too_large") return pcFail("too_large", 413);
  if (!body || typeof body.profId !== "string" || !UUID.test(body.profId) || typeof body.reasonId !== "string" || !UUID.test(body.reasonId)) {
    return pcFail("bad_request", 400);
  }

  const access = await patientPage(db, body.profId);
  if (!access.ok) return pcFail(access.code, accessStatus(access.code));
  const admin = pcAdmin();
  const [rules, reason] = await Promise.all([practiceRules(admin, body.profId), practiceReason(admin, body.profId, body.reasonId)]);
  if (!rules || !reason) return pcFail("not_found", 404);
  const checked = checkAnswers(rules.config, reason, body.answers);
  if (!checked) return pcFail("invalid_answers", 422);

  const r = scoreForRequest(rules.config, reason.kind, checked.answers);
  const autoMessages = rules.config.autoMessages
    .filter((a) => r.autoMessages.includes(a.id))
    .map(({ id, text, tone }) => ({ id, text, tone }));
  return NextResponse.json({ warning: r.warning, autoMessages, canSkip: r.canSkipSend });
}
