import { scoreRequest, type Answers, type Band, type ChannelConfig, type ScoreLine } from "./score";
import { scoreForRequest, type ReasonKind } from "./requestScore";
import { toAiLines, type AiLine } from "./aiRead";
import type { AiStatus } from "./aiDb";

// A rules save rescores the open requests (pc_rescore_open). For one the AI read ('done'), the
// M7 contract (3b, 4b) wants two scores: the keyword-only one (kw, restored by Desfazer) and
// the one with the stored AI symptoms that are still in the new rules (the main score). AI ids
// no longer in the rules drop out; if none remain, the reading is 'undone' with the keyword
// score. "Never lower" is pc_ai_apply's rule only: a rules save may lower a score. A request
// still being read ('pending') is rescored keyword-only (its apply then answers 'stale').

export type RescoreElement = {
  id: string;
  total: number;
  band: Band;
  lines: ScoreLine[];
  floorApplied: boolean;
  kw?: { total: number; band: Band; lines: ScoreLine[] };
  aiLines?: AiLine[];
  aiStatus?: "undone";
};

export function rescoreOne(
  config: ChannelConfig,
  q: { id: string; kind: ReasonKind; answers: Answers; aiStatus: AiStatus; aiLines: AiLine[] },
): RescoreElement {
  // The keyword score never counts AI symptoms, whatever the doctor's switch says now.
  const kw = scoreForRequest({ ...config, aiMapping: false }, q.kind, q.answers);
  const base = { id: q.id, total: kw.total, band: kw.band, lines: kw.lines, floorApplied: kw.floorApplied };
  // Only a symptom form has free text, so only it can have been read.
  if (q.aiStatus !== "done" || q.kind !== "symptom_form") return base;

  const keep = q.aiLines.filter((l) => config.symptoms.some((s) => s.id === l.symptomId));
  const kwPart = { total: kw.total, band: kw.band, lines: kw.lines };
  if (keep.length === 0) return { ...base, kw: kwPart, aiLines: [], aiStatus: "undone" };

  // The AI pass: the reading happened, so its symptoms count even if the switch is off now.
  const withAi = scoreRequest({ ...config, aiMapping: true }, q.answers, { aiSymptomIds: keep.map((l) => l.symptomId) });
  return {
    id: q.id,
    total: withAi.total,
    band: withAi.band,
    lines: withAi.lines,
    floorApplied: withAi.floorApplied,
    kw: kwPart,
    // The same quotes, with the points the new rules give them.
    aiLines: toAiLines(keep, withAi.lines),
  };
}
