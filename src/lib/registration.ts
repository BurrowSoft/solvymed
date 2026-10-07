// Settings → Profile's council registration for Brazilian practices (cf: the
// app's Settings → Registrations on the website). The same format as the
// app's lib/registration.ts: CRM number + state saved as one line
// ("CRM 12345/SP", professionals.professional_registration), else another
// council + number ("CRO 123").

export const BR_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export interface CouncilFields {
  crm?: string;
  crmState?: string;
  additionalCouncil?: string;
  additionalCouncilNumber?: string;
}

// The council registration as one line: CRM first, else another council.
export function councilRegistration(c: CouncilFields | null | undefined): string | null {
  if (!c) return null;
  const crm = (c.crm ?? "").trim();
  if (crm) {
    const state = (c.crmState ?? "").trim().toUpperCase();
    return state ? `CRM ${crm}/${state}` : `CRM ${crm}`;
  }
  const council = (c.additionalCouncil ?? "").trim();
  const number = (c.additionalCouncilNumber ?? "").trim();
  if (council && number) return `${council.toUpperCase()} ${number}`;
  return null;
}

// The saved one-line registration back into the fields, so the form shows
// (and a save keeps) what the account already has: "CRM 12345/SP" → CRM +
// UF; anything else → another council + number.
// The controlled prescription's issuer box ("Nº inscrição CRM" + "UF"), as
// the app (12's #413 finding): a CRM gives its number and its own UF, else
// the clinic's state; anything else (another council, free text) is printed
// as typed, with the clinic's state.
export function crmIssuer(registration: string | null | undefined, clinicState: string | null | undefined): { crm: string; uf: string } {
  const p = parseCouncilRegistration(registration);
  const state = (clinicState ?? "").trim().toUpperCase();
  if (p.crm) return { crm: p.crm, uf: p.crmState || state };
  return { crm: (registration ?? "").trim(), uf: state };
}

export function parseCouncilRegistration(reg: string | null | undefined): CouncilFields {
  const s = (reg ?? "").trim();
  if (!s) return {};
  const crm = /^CRM\s+(\S+?)(?:\/([A-Za-z]{2}))?$/i.exec(s);
  if (crm) return { crm: crm[1], crmState: (crm[2] ?? "").toUpperCase() };
  // A bare number is a CRM without a state (c6; the app the same).
  if (/^\d+$/.test(s)) return { crm: s, crmState: "" };
  const i = s.indexOf(" ");
  if (i > 0) return { additionalCouncil: s.slice(0, i), additionalCouncilNumber: s.slice(i + 1).trim() };
  return { additionalCouncilNumber: s };
}
