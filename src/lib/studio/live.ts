import { conditionMet } from "@/lib/conditions";
import { foundersPreview } from "@/lib/liveFeatures";

// Whether Document Studio works here: on Production once
// document-studio-live is met (both platforms ready); on Previews before
// that, so testers can run the rows (as multiPractice: "Previews only until
// the release"). The Help and the App Map follow the condition only.
export function studioEnabled(): boolean {
  return conditionMet("document-studio-live") || foundersPreview;
}
