import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { isProfessionalRole } from "@/lib/effectiveProfId";
import { getPracticeCountry } from "@/lib/practiceCountry";
import { patientChannelEnabled } from "@/lib/patientChannel/live";
import { fromStoredRules, toStoredRules, validateRules } from "@/lib/patientChannel/rules";
import { storedAnswers, type ReasonKind } from "@/lib/patientChannel/requestScore";
import { rescoreOne } from "@/lib/patientChannel/aiRescore";
import { toStoredAiLines } from "@/lib/patientChannel/aiRead";
import { AI_STATUSES } from "@/lib/patientChannel/aiDb";
import { pcAdmin, pcBody, pcCaller, pcFail } from "@/lib/patientChannel/server";

export const runtime = "nodejs";
export const preferredRegion = "gru1";

const MAX_BODY = 128 * 1024;

// PUT /api/patient-channel/config {rules, expectedVersion} (specs/patient-contact-tech.md
// §4.7): the doctor saves their rules. Validated here exactly as 237's _pc_rules_valid
// (validateRules), saved by pc_save_rules (service role; optimistic concurrency on the
// version: 409 version_conflict → the page reloads), then every OPEN request scored with
// an older version is rescored with score.ts and written by pc_rescore_open (decision 11:
// answered requests keep their score). 404 while the channel is off for the caller.
export async function PUT(request: NextRequest) {
  const { user, db } = await pcCaller(request).catch(() => ({ user: null, db: null }));
  if (!user || !db) return pcFail("unauthorized", 401);
  if (!(await patientChannelEnabled(db, user.id))) return pcFail("not_found", 404);
  if ((await isProfessionalRole(db, user.id)) !== true) return pcFail("not_doctor", 403);

  const body = await pcBody<{ rules?: unknown; expectedVersion?: unknown }>(request, MAX_BODY);
  if (body === "too_large") return pcFail("too_large", 413);
  if (!body || !Number.isInteger(body.expectedVersion) || (body.expectedVersion as number) < 0) return pcFail("bad_request", 400);

  const country = await getPracticeCountry(db, user.id, user.id);
  let stored;
  try {
    const config = fromStoredRules(toStoredRules(fromStoredRules(body.rules, country)), country);
    const problems = validateRules(config);
    if (problems.length > 0) return pcFail("invalid_rules", 422, { path: problems[0].path });
    stored = toStoredRules(config);
  } catch {
    return pcFail("invalid_rules", 422);
  }

  const admin = pcAdmin();
  const { data: version, error } = await admin.rpc("pc_save_rules", {
    p_prof: user.id, p_rules: stored, p_expected_version: body.expectedVersion,
  });
  if (error) {
    const m = error.message ?? "";
    if (m.includes("version_conflict")) return pcFail("version_conflict", 409);
    if (m.includes("invalid_rules")) return pcFail("invalid_rules", 422);
    return pcFail("failed", 500);
  }

  // The open requests scored with an older version, rescored with the saved rules.
  const config = fromStoredRules(stored, country);
  let rescored = 0;
  try {
    const readOpen = (columns: string) => admin
      .from("pc_requests")
      .select(columns)
      .eq("professional_id", user.id)
      .eq("status", "open")
      .lt("rules_version", version as number);
    // With M7's columns (the AI reading's status and lines); before the M7 migration they don't
    // exist (42703), and every request is keyword-only.
    let { data: open, error: readError } = await readOpen("id, answers, text, reason_snapshot, ai_status, ai_lines");
    if (readError?.code === "42703") ({ data: open, error: readError } = await readOpen("id, answers, text, reason_snapshot"));
    if (readError) throw readError;
    // The same scoring as the submit (lib/patientChannel/requestScore), per reason kind; an AI
    // reading ('done') also sends its keyword score and the AI lines still in the rules (M7, 3b).
    type OpenRow = { id: string; answers: unknown; text: string | null; reason_snapshot: { kind?: ReasonKind } | null; ai_status?: unknown; ai_lines?: unknown };
    const scores = ((open ?? []) as unknown as OpenRow[]).map((q) => rescoreOne(config, {
      id: q.id,
      kind: q.reason_snapshot?.kind ?? "symptom_form",
      answers: storedAnswers(q.answers, q.text),
      aiStatus: AI_STATUSES.find((s) => s === q.ai_status) ?? "none",
      aiLines: toStoredAiLines(q.ai_lines),
    }));
    if (scores.length > 0) {
      const { data: n, error: rescoreError } = await admin.rpc("pc_rescore_open", { p_prof: user.id, p_version: version, p_scores: scores });
      if (rescoreError) throw rescoreError;
      rescored = (n as number) ?? 0;
    }
  } catch (e) {
    // The rules are saved; the open requests keep their old scores until the next save.
    Sentry.captureMessage("pc_rescore_failed", { level: "warning", extra: { code: (e as { code?: string })?.code ?? null } });
  }

  return NextResponse.json({ version, rescored });
}
