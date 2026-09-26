// "Today" and "now" in the practice's time zone, for server code. Vercel
// runs in UTC, so new Date().toISOString() is a day ahead in Brazil from
// 21:00. Every server-side date that a person reads or that gets stored on
// a clinical row comes from here. (Client components already run in the
// browser's zone.)

export const DEFAULT_CLINIC_TZ = "America/Sao_Paulo";

type TimeZoneReader = {
  from: (table: "professionals") => {
    select: (cols: "time_zone") => {
      eq: (col: "id", value: string) => { maybeSingle: () => PromiseLike<{ data: { time_zone?: string | null } | null; error: unknown }> };
    };
  };
  rpc: (fn: "get_my_clinic") => PromiseLike<{ data: unknown; error: unknown }>;
};

// The practice's time zone (professionals.time_zone, migration 099): the
// doctor reads their own row, a secretary gets it through get_my_clinic().
// Any failure (including the column not existing yet) falls back to
// America/Sao_Paulo, so this works before and after 099.
export async function getClinicTimeZone(
  supabase: unknown,
  opts: { professionalId: string; isSecretary: boolean },
): Promise<string> {
  const db = supabase as TimeZoneReader;
  try {
    if (opts.isSecretary) {
      const { data, error } = await db.rpc("get_my_clinic");
      const row = (Array.isArray(data) ? data[0] : data) as { time_zone?: string | null } | null;
      return error ? DEFAULT_CLINIC_TZ : validZone(row?.time_zone);
    }
    const { data, error } = await db.from("professionals").select("time_zone").eq("id", opts.professionalId).maybeSingle();
    return error ? DEFAULT_CLINIC_TZ : validZone(data?.time_zone);
  } catch {
    return DEFAULT_CLINIC_TZ;
  }
}

function validZone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_CLINIC_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_CLINIC_TZ;
  }
}

function parts(at: Date, tz: string | null | undefined) {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-CA", {
    timeZone: validZone(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at)) {
    out[p.type] = p.value;
  }
  return out;
}

// YYYY-MM-DD in the practice's zone.
export function clinicDate(at: Date = new Date(), tz?: string | null): string {
  const p = parts(at, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

// HH:MM (24h) in the practice's zone.
export function clinicTime(at: Date = new Date(), tz?: string | null): string {
  const p = parts(at, tz);
  return `${p.hour}:${p.minute}`;
}

// The hour (0-23) in the practice's zone.
export function clinicHour(at: Date = new Date(), tz?: string | null): number {
  return Number(parts(at, tz).hour);
}

// Calendar arithmetic on YYYY-MM-DD strings (no time zone involved).
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 0 = Sunday … 6 = Saturday, for a YYYY-MM-DD date.
export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

// Monday to Sunday of the week containing `date`.
export function weekRange(date: string): { from: string; to: string } {
  const from = addDays(date, -((weekday(date) + 6) % 7));
  return { from, to: addDays(from, 6) };
}

// First to last day of the month before `date`'s month.
export function previousMonthRange(date: string): { from: string; to: string } {
  const to = addDays(`${date.slice(0, 7)}-01`, -1);
  return { from: `${to.slice(0, 7)}-01`, to };
}
