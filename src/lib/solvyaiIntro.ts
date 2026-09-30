import { conditionMet } from "@/lib/conditions";
import { liveFeatures } from "@/lib/liveFeatures";

// The one-time "Meet SolvyAI ✦" card (UX, go-live). Its seen state is a
// tour_progress row like a Novidades release's (migration 113 accepts
// "news:<id>"), separate from the 1.4.0 news, which is marked seen before
// SolvyAI goes live.
export const SOLVYAI_INTRO_TOUR = "news:solvyai";

// Shown only once SolvyAI is really on for customers: the panel is on
// (liveFeatures.solvyAi) and solvyai-live is met (the privacy text, Help and
// App Map say so too).
export function solvyAiIntroOn(): boolean {
  return liveFeatures.solvyAi && conditionMet("solvyai-live");
}
