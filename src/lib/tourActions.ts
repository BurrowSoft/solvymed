"use server";

import { createClient } from "@/lib/supabase/server";
import type { TourStatus } from "./tourState";

// Saves the tour's progress for this account on the web (migration 113,
// set_tour_progress: the caller's own row only). Best effort: before 113,
// or on any error, nothing is saved and the tour still works.
// tour: "main", or "news:<release>" for a Novidades popup (the format
// migration 113 accepts).
// true when the database took it (the caller may try once more otherwise).
export async function saveTourProgress(status: TourStatus, step: number, tour = "main"): Promise<boolean> {
  if (!["started", "completed", "skipped"].includes(status) || !Number.isInteger(step) || step < 0 || step > 100) return false;
  if (tour !== "main" && !/^news:[0-9A-Za-z._-]{1,32}$/.test(tour)) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_tour_progress", { p_platform: "web", p_tour: tour, p_status: status, p_step: step });
    return !error;
  } catch {
    // Best effort.
    return false;
  }
}
