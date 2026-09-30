// The Founders Program's application (integrations/founders-page-spec.md,
// stage 1; migration 129 = founder_apply / founder_places). The database
// validates everything and rate-limits per IP; this module only shapes the
// request and maps its answers to the form's messages.
import type { Metadata } from "next";
import type { Attribution } from "./attribution";

// The share preview of the Founders pages (/founders and its rules): the
// brand kit's blue banner (UX, 1 Oct). A page-level openGraph/twitter
// replaces the layout's whole object, so the site-wide fields are repeated.
export const FOUNDERS_OG_IMAGE = "/og/solvymed-og-share-blue.png";
// The public URL of a Founders page (canonical and share links): English
// has no locale prefix. sub: "" (the page) or "/rules".
export function foundersUrl(locale: string, sub = ""): string {
  return `https://www.solvymed.com${locale === "en" ? "" : `/${locale}`}/founders${sub}`;
}
export function foundersShareMeta(a: { locale: string; url: string; title: string; description: string }): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: "Solvymed",
      locale: a.locale.replace("-", "_"),
      url: a.url,
      title: a.title,
      description: a.description,
      images: [{ url: FOUNDERS_OG_IMAGE, width: 1200, height: 630, alt: a.title }],
    },
    twitter: { card: "summary_large_image", title: a.title, description: a.description, images: [FOUNDERS_OG_IMAGE] },
  };
}

// Brazil and Thailand have places per system; other countries may apply,
// with no counter (UX).
export const FOUNDERS_COUNTRIES = ["BR", "TH", "OTHER"] as const;
export type FoundersCountry = (typeof FOUNDERS_COUNTRIES)[number];

// The clinic systems per country (UX's copy file; brand names aren't
// translated). The slugs are what migration 129 stores and counts.
export const SYSTEMS: Record<"BR" | "TH", { slug: string; name: string }[]> = {
  BR: [
    { slug: "iclinic", name: "iClinic" },
    { slug: "feegow", name: "Feegow" },
    { slug: "amplimed", name: "Amplimed" },
    { slug: "prodoctor", name: "ProDoctor" },
    { slug: "hidoctor", name: "HiDoctor" },
    { slug: "prontuario_verde", name: "Prontuário Verde" },
    { slug: "ninsaude", name: "Ninsaúde" },
    { slug: "simples_dental", name: "Simples Dental" },
  ],
  TH: [
    { slug: "proclinic", name: "ProClinic" },
    { slug: "cliniter", name: "Cliniter" },
    { slug: "cliniclive", name: "cliniclive" },
    { slug: "easy_clinic", name: "Easy Clinic" },
    { slug: "clinixmate", name: "ClinixMate" },
    { slug: "delhos", name: "DelHos" },
    { slug: "iclinig", name: "iClinig" },
    { slug: "gio_clinic", name: "GIO Clinic" },
  ],
};
// Offered in every country, never counted.
export const GENERIC_SYSTEMS = ["other", "spreadsheet", "paper"] as const;

export function systemName(slug: string): string {
  for (const list of Object.values(SYSTEMS)) {
    const s = list.find((x) => x.slug === slug);
    if (s) return s.name;
  }
  return slug;
}

// The answers' option slugs (sent to 129 as given).
export const OPTIONS = {
  usage_years: ["lt1", "1_3", "3plus"],
  patient_count_range: ["lt200", "200_1000", "1000_5000", "5000plus"],
  wants: ["patients", "future_appointments", "appointment_history", "clinical_records", "prescriptions", "files_exams"],
  can_export: ["yes", "not_sure", "support_only"],
  team_size: ["alone", "one_secretary", "two_plus"],
} as const;

// The page's default country from its language.
export const defaultFoundersCountry = (locale: string): FoundersCountry => (locale === "pt-BR" ? "BR" : locale === "th" ? "TH" : "OTHER");

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
