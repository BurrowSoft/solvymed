// 1.8.0 E: the doctor's card payment link (professionals.card_payment_url,
// migration 210): the page where patients pay by card, from the doctor's
// payment provider. https only, at most 500 characters: the database's
// CHECK (professionals_card_payment_url_https), checked here first.

export const CARD_LINK_MAX = 500;
const CARD_LINK = /^https:\/\/\S+$/;

// The link as saved, or null when empty or not a valid link (a stored bad
// value is never shown to a patient).
export function normalizeCardLink(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  return s && s.length <= CARD_LINK_MAX && CARD_LINK.test(s) ? s : null;
}

// For the Settings field: empty clears it; anything else must be a valid link.
export function cardLinkInput(raw: string | null | undefined): { ok: true; value: string | null } | { ok: false } {
  const s = (raw ?? "").trim();
  if (!s) return { ok: true, value: null };
  const v = normalizeCardLink(s);
  return v ? { ok: true, value: v } : { ok: false };
}
