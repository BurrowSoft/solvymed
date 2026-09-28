// The tour's server state (migration 113: tour_progress, one row per
// account, platform and tour). Before 113 the table doesn't exist: the
// tour never starts by itself then (it can still be replayed from
// Settings).

export type TourStatus = "started" | "completed" | "skipped";
export type TourState =
  | { kind: "unavailable" } // no table yet, or the read failed: no auto-start
  | { kind: "none" } // never started: auto-start (first sign-in after sign-up)
  | { kind: "row"; status: TourStatus; step: number };

type Reader = {
  from: (t: "tour_progress") => {
    select: (c: string) => {
      eq: (c: string, v: string) => {
        eq: (c: string, v: string) => {
          eq: (c: string, v: string) => { maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }> };
        };
      };
    };
  };
};

// tour: "main" (the guided tour) or "news:<release>" (a Novidades popup).
export async function readTourState(db: unknown, userId: string, tour = "main"): Promise<TourState> {
  try {
    const { data, error } = await (db as Reader)
      .from("tour_progress")
      .select("status, step")
      .eq("user_id", userId)
      .eq("platform", "web")
      .eq("tour", tour)
      .maybeSingle();
    if (error) return { kind: "unavailable" };
    if (!data) return { kind: "none" };
    const row = data as { status: TourStatus; step: number | null };
    return { kind: "row", status: row.status, step: row.step ?? 0 };
  } catch {
    return { kind: "unavailable" };
  }
}

// What the dashboard does with it: start the tour, offer to resume it, or
// nothing.
export function tourEntry(state: TourState): "auto" | "resume" | null {
  if (state.kind === "none") return "auto";
  if (state.kind === "row" && state.status === "started") return "resume";
  return null;
}
