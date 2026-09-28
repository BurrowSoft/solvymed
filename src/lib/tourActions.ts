"use server";

import { createClient } from "@/lib/supabase/server";
import type { TourStatus } from "./tourState";

// Saves the tour's progress for this account on the web (migration 113,
// set_tour_progress: the caller's own row only). Best effort: before 113,
// or on any error, nothing is saved and the tour still works.
export async function saveTourProgress(status: TourStatus, step: number): Promise<void> {
  if (!["started", "completed", "skipped"].includes(status) || !Number.isInteger(step) || step < 0 || step > 100) return;
  try {
    const supabase = await createClient();
    await supabase.rpc("set_tour_progress", { p_platform: "web", p_tour: "main", p_status: status, p_step: step });
  } catch {
    // Best effort.
  }
}
