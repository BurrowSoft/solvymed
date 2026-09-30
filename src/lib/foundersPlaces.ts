import { SYSTEMS } from "./founders";

// The public places counter (migration 129's founder_places: counts only,
// never an applicant). places_left null = no limit (no counter shown);
// 0 = full (waitlist).
export type Place = { system: string; name: string; placesLeft: number | null; capacity: number | null };

type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

export async function readPlaces(db: unknown, country: "BR" | "TH"): Promise<Place[] | null> {
  const list = SYSTEMS[country];
  try {
    const { data, error } = await (db as Rpc).rpc("founder_places", { p_country: country, p_systems: list.map((s) => s.slug) });
    if (error || !Array.isArray(data)) return null;
    const rows = new Map((data as { system: string; capacity: number | null; places_left: number | null }[]).map((r) => [r.system, r]));
    return list.map((s) => {
      const r = rows.get(s.slug);
      return { system: s.slug, name: s.name, placesLeft: r?.places_left ?? null, capacity: r?.capacity ?? null };
    });
  } catch {
    return null;
  }
}
