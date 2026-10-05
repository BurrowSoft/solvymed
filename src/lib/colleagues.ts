// "Refer a colleague" (1.5.0 item 4; 167; migration 180, mobile #360).
// A doctor's private list of colleagues, added by their exact public code
// (no search, no directory); the referral is a message with the colleague's
// public link, built here: nothing about it is stored, no patient data goes
// anywhere. The same contract as the app (d1).
import { withCountryHint } from "./signupCountry";
import { withBrandTitle } from "./doctorName";

export const SITE = "https://www.solvymed.com";

// One row of list_my_colleagues / add_my_colleague. An unavailable card
// (closed, or the brand no longer saved) has only id, name, date.
export type ColleagueRow = {
  colleague_id: string;
  display_name: string | null;
  title: string | null;
  specialty: string | null;
  accent_color: string | null;
  logo_square_path: string | null;
  logo_wide_path: string | null;
  public_code: string | null;
  country: string | null;
  added_at: string;
  available: boolean;
};

// The RPCs' error codes, and not_found (add returns no rows).
export type ColleagueError = "notFound" | "self" | "limit" | "tooMany" | "failed" | "notAllowed" | "notEnabled";

export function colleagueError(message: string | null | undefined): ColleagueError {
  const m = message ?? "";
  if (m.includes("self")) return "self";
  if (m.includes("limit_reached")) return "limit";
  if (m.includes("too_many_attempts")) return "tooMany";
  if (m.includes("not_allowed")) return "notAllowed";
  if (m.includes("not_enabled")) return "notEnabled";
  return "failed";
}

/** The colleague's name as their public page shows it (the brand title in front once). */
export function colleagueName(c: Pick<ColleagueRow, "title" | "display_name">): string {
  return withBrandTitle(c.title, c.display_name) || "—";
}

/** Their public page, with the practice-country hint (?c=BR/TH) as every invite link. */
export function colleagueLink(c: Pick<ColleagueRow, "public_code" | "country">): string | null {
  return c.public_code ? withCountryHint(`${SITE}/join/${encodeURIComponent(c.public_code)}`, c.country) : null;
}

/** A public brand-assets path as a URL (the bucket is public; 161). */
export function colleagueLogoUrl(c: Pick<ColleagueRow, "logo_square_path" | "logo_wide_path">): string | null {
  const path = c.logo_square_path || c.logo_wide_path;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return path && base ? `${base.replace(/\/$/, "")}/storage/v1/object/public/brand-assets/${path.split("/").map(encodeURIComponent).join("/")}` : null;
}

/** The patient's first name, for the greeting. */
export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? "";
}
