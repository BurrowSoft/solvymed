// The Founders Program's application (integrations/founders-page-spec.md,
// stage 1; migration 129 = founder_apply / founder_places). The database
// validates everything and rate-limits per IP; this module only shapes the
// request and maps its answers to the form's messages.
import type { Attribution } from "./attribution";

export const FOUNDERS_COUNTRIES = ["BR", "TH"] as const;
export type FoundersCountry = (typeof FOUNDERS_COUNTRIES)[number];

// What the form sends (the route adds the IP; the honeypot never reaches
// the database).
export type FounderForm = {
  locale: string;
  country: string;
  full_name: string;
  email: string;
  phone: string;
  profession?: string;
  registration_number?: string;
  system: string;
  system_other?: string;
  usage_years?: string;
  patient_count_range?: string;
  wants?: string[];
  can_export?: string;
  team_size?: string;
  consent: boolean;
};

const MAX_TEXT = 200;
const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX_TEXT) : "");

// The payload founder_apply takes: known keys only, trimmed; utm only from
// the consent-gated attribution cookie (the signup rule).
export function founderPayload(body: Record<string, unknown>, attribution: Attribution | null): Record<string, unknown> {
  const wants = Array.isArray(body.wants) ? body.wants.map(str).filter(Boolean).slice(0, 12) : [];
  const utm = attribution
    ? Object.fromEntries(
        (["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const)
          .filter((k) => attribution[k])
          .map((k) => [k, attribution[k]])
          .concat(attribution.referrer_host ? [["referrer", attribution.referrer_host]] : []),
      )
    : {};
  return {
    locale: str(body.locale),
    country: str(body.country).toUpperCase(),
    full_name: str(body.full_name),
    email: str(body.email).toLowerCase(),
    phone: str(body.phone),
    profession: str(body.profession),
    registration_number: str(body.registration_number),
    system: str(body.system),
    system_other: str(body.system_other),
    usage_years: str(body.usage_years),
    patient_count_range: str(body.patient_count_range),
    wants,
    can_export: str(body.can_export),
    team_size: str(body.team_size),
    consent: body.consent === true,
    utm,
  };
}

// The visitor's IP on Vercel: the first x-forwarded-for entry, else
// x-real-ip. None: the request is refused (the rate limit needs it).
export function clientIp(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = fwd || headers.get("x-real-ip")?.trim() || "";
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null;
}

export type ApplyError = { code: "invalid"; field: string } | { code: "too_many_attempts" } | { code: "already_applied" } | { code: "generic" };

// founder_apply's errors (error.message) → the form's codes.
export function mapApplyError(message: string | undefined): ApplyError {
  const m = (message ?? "").trim();
  const inv = m.match(/invalid:([a-z_]+)/);
  if (inv) return { code: "invalid", field: inv[1] };
  if (m.includes("too_many_attempts")) return { code: "too_many_attempts" };
  if (m.includes("already_applied")) return { code: "already_applied" };
  return { code: "generic" };
}
