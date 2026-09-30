import { conditionMet } from "@/lib/conditions";
import { liveFeatures } from "@/lib/liveFeatures";
import { isAccessAllowed, type EffectiveSub } from "@/lib/subscription";

// The one-time "Meet SolvyAI ✦" card (UX, go-live). Its seen state is a
// tour_progress row like a Novidades release's (migration 113 accepts
// "news:<id>"), separate from the 1.4.0 news, which is marked seen before
// SolvyAI goes live.
export const SOLVYAI_INTRO_TOUR = "news:solvyai";

// Whether the SolvyAI panel is on this dashboard: the flag, doctors only,
// and not while the account is locked (only Settings is open then). The
// panel and the card share it, so the card never offers a panel that isn't
// there (9a).
export function solvyAiPanelOn({ isSecretary, sub }: { isSecretary: boolean; sub: EffectiveSub | null }): boolean {
  return liveFeatures.solvyAi && !isSecretary && !(sub && !isAccessAllowed(sub));
}

// The card: where the panel is, once SolvyAI is really on for customers
// (solvyai-live: the privacy text, Help and App Map say so too).
export function solvyAiIntroOn(panel: { isSecretary: boolean; sub: EffectiveSub | null }): boolean {
  return solvyAiPanelOn(panel) && conditionMet("solvyai-live");
}
