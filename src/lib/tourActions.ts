"use server";

import { createClient } from "@/lib/supabase/server";
import type { TourStatus } from "./tourState";

// Saves the tour's progress for this account on the web (migration 113,
// set_tour_progress: the caller's own row only). Best effort: before 113,
// or on any error, nothing is saved and the tour still works.
// tour: "main", or "news:<release>" for a Novidades popup (the format
// migration 113 accepts).
export async function saveTourProgress(status: TourStatus, step: number, tour = "main"): Promise<void> {
  if (!["started", "completed", "skipped"].includes(status) || !Number.isInteger(step) || step < 0 || step > 100) return;
  if (tour !== "main" && !/^news:[0-9A-Za-z._-]{1,32}$/.test(tour)) return;
  try {
    const supabase = await createClient();
    await supabase.rpc("set_tour_progress", { p_platform: "web", p_tour: tour, p_status: status, p_step: step });
  } catch {
    // Best effort.
  }
}
