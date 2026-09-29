// Before a question leaves the browser, anything that looks like an
// identifier is masked (specs/assistant.md §6): CPF, a Thai national ID,
// phone numbers and email addresses. Names are sent as typed (they can't be
// masked reliably), which is why the input asks not to type patient data.

// The SAME rules as the app (mobile lib/solvyai.ts maskPersonalData, one
// shared case table); the /api/assistant route re-masks with this too. Change
// both together. Dates in any shape ("29/09", "2026-09-28", "29.09.2026"),
// times, amounts and plain numbers ("1500 2000") are left alone.
export function maskPersonalData(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]")
    // International numbers first ("+55 11 91234-5678" has 13 digits too).
    .replace(/\+\d[\d\s()-]{7,17}\d/g, "[phone]")
    // Thai ID: 13 digits, optionally grouped (1-2345-67890-12-3).
    .replace(/\b\d[\d -]{11,15}\d\b/g, (m) => (m.replace(/\D/g, "").length === 13 ? "[id]" : m))
    // Thai mobiles (0XX-XXX-XXXX), then Brazilian numbers, which need a
    // telling shape: a DDD (in parentheses, or two digits before 8-9 more), a
    // 9-prefixed mobile, a hyphen, or 8+ digits in a row. A bare "1500 2000"
    // is indistinguishable from an amount pair and is left alone.
    .replace(/\b0\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g, "[phone]")
    .replace(/\(\d{2}\)\s?\d{4,5}[\s-]?\d{4}\b/g, "[phone]")
    .replace(/\b\d{2}[\s-]9?\d{4}[\s-]?\d{4}\b/g, "[phone]")
    .replace(/\b9\d{4}[\s-]?\d{4}\b/g, "[phone]")
    .replace(/\b\d{4,5}-\d{4}\b/g, "[phone]")
    .replace(/\b\d{8,}\b/g, "[phone]");
}

// The spec's limits on what can be sent (§4.5).
export const MAX_MESSAGE_CHARS = 500;
export const MAX_TURNS = 12;
export const MIN_SECONDS_BETWEEN = 3;
