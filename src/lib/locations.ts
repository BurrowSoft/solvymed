// 1.8.0 F (migration 200): several practice locations. A location is a
// `clinics` row; shown only with the server switch practice_locations on and
// 2+ locations (one location = exactly as before). The same rules as the
// app's lib/locations.ts. Days follow the working hours' keys.

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export type PracticeLocation = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  is_primary?: boolean | null;
};

// The patient-facing list (get_professional_public_info.locations, UX Q4):
// each with its address and the days it serves.
export type PublicLocation = PracticeLocation & { days: string[] };

// The list to show: the doctor's locations when there are 2+, else none.
export function shownLocations<T extends PracticeLocation>(list: T[] | null | undefined, switchOn: boolean): T[] {
  return switchOn && list && list.length >= 2 ? list : [];
}

// The primary first, then the doctor's order (the app's ordering).
export function sortLocations<T extends PracticeLocation & { position?: number | null; created_at?: string | null }>(list: T[]): T[] {
  return [...list].sort((a, b) =>
    Number(!!b.is_primary) - Number(!!a.is_primary)
    || (a.position ?? 0) - (b.position ?? 0)
    || (a.created_at ?? "").localeCompare(b.created_at ?? "")
    || a.name.localeCompare(b.name));
}

// A visit's location name: its own, else the primary's; null when not shown.
export function locationNameFor(locationId: string | null | undefined, list: PracticeLocation[]): string | null {
  if (list.length < 2) return null;
  const l = list.find((x) => x.id === locationId) ?? list.find((x) => x.is_primary);
  return l?.name ?? null;
}

// The day key (mon…sun) of a YYYY-MM-DD date.
export function dayKeyOf(date: string): DayKey {
  const [y, m, d] = date.split("-").map(Number);
  return (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const)[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()] as DayKey;
}

// The location a day's hours point at (one of the doctor's), else the primary
// (the database's _location_for_day, so a new appointment's default matches).
export function locationIdForDate(
  hours: Partial<Record<string, { location_id?: string | null } | null>> | null | undefined,
  date: string,
  list: PracticeLocation[],
): string | null {
  if (list.length < 2) return null;
  const id = hours?.[dayKeyOf(date)]?.location_id;
  if (id && list.some((l) => l.id === id)) return id;
  return list.find((l) => l.is_primary)?.id ?? list[0].id;
}

// The working-hours picker's value for a day: "" (stored as null = "the
// primary", which then follows a new primary, as in the app) unless the day
// points at another of the doctor's locations.
export function dayLocationValue(stored: string | null | undefined, list: PracticeLocation[]): string {
  const l = stored ? list.find((x) => x.id === stored) : undefined;
  return l && !l.is_primary ? l.id : "";
}

// UX Q4: the public location serving a date, or null with fewer than 2.
export function publicLocationForDate(list: PublicLocation[] | null | undefined, date: string): PublicLocation | null {
  if (!list || list.length < 2) return null;
  const key = dayKeyOf(date);
  return list.find((l) => l.days.includes(key)) ?? list.find((l) => l.is_primary) ?? null;
}

// "Rua X, 10, Cidade, UF": the address line (empty parts left out).
export function addressLine(l: Pick<PracticeLocation, "address" | "city" | "state">): string {
  return [l.address, l.city, l.state].filter((x) => x && x.trim()).join(", ");
}

// The documents' footer lines (the app's template-service): every location,
// "Name · address, city, state · phone", with 2+ locations; else none.
export function locationFooterLines(list: PracticeLocation[]): string[] {
  if (list.length < 2) return [];
  return list.map((l) => [l.name, addressLine(l), l.phone].filter((x) => x && String(x).trim()).join(" · "));
}
