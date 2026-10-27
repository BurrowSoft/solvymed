import { NextRequest, NextResponse } from "next/server";
import { patientChannelEnabled } from "@/lib/patientChannel/live";
import { UUID, accessCode, accessStatus, patientPage, practiceReason, practiceRules } from "@/lib/patientChannel/practice";
import { checkAnswers, scoreForRequest } from "@/lib/patientChannel/requestScore";
import { pcAdmin, pcBody, pcCaller, pcFail } from "@/lib/patientChannel/server";

export const runtime = "nodejs";
export const preferredRegion = "gru1";

// POST /api/patient-channel/requests {profId, reasonId, answers, autoMessagesShown, replace?}
// (specs/patient-contact-tech.md §4.4/§4.7): the patient sends a request. The answers are
// checked against the practice's rules and the reason (422 invalid_answers), scored HERE
// with score.ts (the same scoring as a rules save's rescore: requestScore), and written by
// 237's pc_submit (service role) with the rules version they were scored with. A rules
// save in between → rules_changed: reload, rescore and retry once, then 503 retry_later.
// One open request per patient: 409 open_exists unless replace. Too many sends in an hour
// (the database's limit per patient and practice) → 429 rate_limited.
export async function POST(request: NextRequest) {
  const { user, db } = await pcCaller(request).catch(() => ({ user: null, db: null }));
  if (!user || !db) return pcFail("unauthorized", 401);
  if (!(await patientChannelEnabled(db, user.id))) return pcFail("not_found", 404);

  const body = await pcBody<{ profId?: unknown; reasonId?: unknown; answers?: unknown; autoMessagesShown?: unknown; replace?: unknown }>(request, 16 * 1024);
  if (body === "too_large") return pcFail("too_large", 413);
  if (!body || typeof body.profId !== "string" || !UUID.test(body.profId) || typeof body.reasonId !== "string" || !UUID.test(body.reasonId)) {
    return pcFail("bad_request", 400);
  }
  const profId = body.profId;
  const reasonId = body.reasonId;
  const shownIds = Array.isArray(body.autoMessagesShown) ? body.autoMessagesShown.filter((x): x is string => typeof x === "string").slice(0, 60) : [];

  const access = await patientPage(db, profId);
  if (!access.ok) return pcFail(access.code, accessStatus(access.code));
  const admin = pcAdmin();
  const reason = await practiceReason(admin, profId, reasonId);
  if (!reason) return pcFail("not_found", 404);

  for (let attempt = 0; attempt < 2; attempt++) {
    const rules = await practiceRules(admin, profId);
    if (!rules) return pcFail("not_found", 404);
    const checked = checkAnswers(rules.config, reason, body.answers);
    if (!checked) return pcFail("invalid_answers", 422);
    const r = scoreForRequest(rules.config, reason.kind, checked.answers);
    // Kept as shown (a clinical record): only messages that fired for these answers.
    const shown = rules.config.autoMessages
      .filter((a) => r.autoMessages.includes(a.id) && shownIds.includes(a.id))
      .map(({ id, text, tone }) => ({ id, text, tone }));
    const { answers } = checked;
    const { data, error } = await admin.rpc("pc_submit", {
      p: {
        profId,
        patientAuthId: user.id,
        reasonId,
        answers: reason.kind === "symptom_form"
          ? { symptomIds: answers.symptomIds, chips: answers.chips, when: answers.when, intensity: answers.intensity, stillTaking: answers.stillTaking }
          : { option: checked.option },
        text: reason.kind === "symptom_form" ? answers.text : "",
        autoMessagesShown: shown,
        replace: body.replace === true,
        rulesVersion: rules.version,
        score: { total: r.total, band: r.band, lines: r.lines, warningShown: r.warning, floorApplied: r.floorApplied },
      },
    });
    if (!error) {
      const d = data as { id: string; replaced: string | null };
      return NextResponse.json({ id: d.id, replaced: d.replaced ?? null });
    }
    const m = error.message ?? "";
    if (m.includes("rules_changed")) continue;
    // 255: one open request per patient, practice AND destination; its DETAIL names the open
    // one, so the replace prompt can say which (launch polish 2). Only its title and date go
    // back to the patient (their own request). NEVER logged: the title can be clinical (cf).
    if (m.includes("open_exists")) return pcFail("open_exists", 409, { open: openRequest(error.details) });
    // 237+'s limit on pc_submit (cf, #623): every send writes a permanent clinical record.
    if (m.includes("rate_limited")) return pcFail("rate_limited", 429);
    if (m.includes("invalid_answers")) return pcFail("invalid_answers", 422);
    if (m.includes("not_found")) return pcFail("not_found", 404);
    const code = accessCode(m);
    return pcFail(code, accessStatus(code));
  }
  return pcFail("retry_later", 503);
}

// pc_submit's open_exists DETAIL (255): {id, reasonTitle, createdAt, destination}. Only the
// title and the date leave; anything malformed is null (the prompt then names no request).
function openRequest(details: string | null | undefined): { reasonTitle: string; createdAt: string } | null {
  try {
    const d = JSON.parse(details ?? "") as { reasonTitle?: unknown; createdAt?: unknown };
    return typeof d.reasonTitle === "string" && typeof d.createdAt === "string" ? { reasonTitle: d.reasonTitle, createdAt: d.createdAt } : null;
  } catch {
    return null;
  }
}
