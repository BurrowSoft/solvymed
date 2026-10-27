import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreRequest, type Answers, type ChannelConfig } from "./score";
import { aiApply, aiRelease, aiReserve, type ApplyOutcome } from "./aiDb";
import { aiSystem, aiUserMessage, maskForAi, toAiLines, validateAiOutput, type AiReader } from "./aiRead";

// One reading of one request, after pc_submit saved it with its keyword score (M7 plan §1–§5).
// Runs in the requests route's after(): the patient never waits, and nothing here can change
// what the patient was shown. Every outcome ends in a final ai_status (contract §2):
// - toggle off / no text / demo / already read → the database refuses the reserve: nothing.
// - out of credits → the reserve marks 'no_credits'.
// - no AI key on this deployment (a preview) → nothing: the request stays 'none', so it uses no
//   credit and no testers-phase slot (cf, #665).
// - an error or the 8 s timeout → release: 'failed', the credit back.
// - else apply: 'done' (upward only, enforced again by the database), 'stale' (a rules save
//   or a reply in between; the credit is kept) or 'refused'.
export type AiRunOutcome = "skipped" | "not_allowed" | "no_reader" | "failed" | ApplyOutcome;

export async function runAiReading(p: {
  admin: SupabaseClient;
  reader: AiReader | null;
  requestId: string;
  config: ChannelConfig;
  rulesVersion: number;
  answers: Answers;
  names: (string | null | undefined)[];
}): Promise<AiRunOutcome> {
  const { admin, reader, requestId, config, answers } = p;
  // The same gates as the reserve, checked first so a channel without the AI costs no call.
  if (!config.aiMapping || answers.text.trim() === "") return "skipped";
  if (!reader) return "no_reader";
  if (!(await aiReserve(admin, requestId))) return "not_allowed";
  try {
    const base = scoreRequest(config, answers);
    const { output, usage } = await reader.read({ system: aiSystem(config), user: aiUserMessage(maskForAi(answers.text, p.names)) });
    const found = validateAiOutput(output, config, answers.text, base.effectiveSymptomIds);
    const scored = scoreRequest(config, answers, { aiSymptomIds: found.map((f) => f.symptomId) });
    return await aiApply(admin, {
      requestId,
      rulesVersion: p.rulesVersion,
      aiLines: toAiLines(found, scored.lines),
      total: scored.total,
      band: scored.band,
      lines: scored.lines,
      inputTokens: usage.input,
      outputTokens: usage.output,
    });
  } catch {
    // Release only moves a 'pending' row, so a failure after a successful apply is harmless.
    await aiRelease(admin, requestId).catch(() => {});
    return "failed";
  }
}
