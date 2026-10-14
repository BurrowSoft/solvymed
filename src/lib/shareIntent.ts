import { conditionMet } from "@/lib/conditions";

// "Not shared yet" (1.9.0 item 1.4, migration 220, both platforms): a
// prescription or document saved with "Share with the patient" on (or
// shared later by hand) records the intent; one whose patient copy never
// arrived (the share failed, or the page was closed mid-share) shows
// "Not shared yet" with "Share with the patient" until a share succeeds.
// Two switches (02): recording the intent starts as soon as 220 is applied
// (share-intent-recording, invisible), so shares that fail before the mark
// ships show it on that day too; the mark itself waits for the app's
// (not-shared-marker-live).

export type ShareSource = "prescription" | "medical_document";

// The mark and its "Share with the patient" button.
export function shareIntentLive(): boolean {
  return conditionMet("not-shared-marker-live");
}

// Saves record the intent (220 applied); also on whenever the mark is.
export function shareIntentRecording(): boolean {
  return conditionMet("share-intent-recording") || shareIntentLive();
}

export function unsharedKey(source: ShareSource, id: string): string {
  return `${source}:${id}`;
}

type Rpc = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ error: unknown }> };

// The intent for an edit or a correction saved with the box on (a new one
// records it in its own insert / create_prescription). Best effort: a
// failure here never undoes the save; the share itself still runs.
export async function noteShareIntent(supabase: Rpc, source: ShareSource, id: string | null | undefined): Promise<void> {
  if (!shareIntentRecording() || !id) return;
  try {
    await supabase.rpc("mark_share_intent", { p_source: source, p_id: id });
  } catch {
    /* the share still runs */
  }
}
