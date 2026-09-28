// Before a help question leaves the browser, anything that looks like a
// patient identifier is masked (specs/assistant.md §6: v1 sends no personal
// data): CPF, a Thai national ID, phone numbers and email addresses.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// CPF: 000.000.000-00 or 11 digits.
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
// Thai ID: 13 digits, optionally grouped 1-2345-67890-12-3.
const THAI_ID = /\b\d(?:[\s-]?\d){12}\b/g;
// Phones: a run of digits with optional +, spaces, dots, dashes and
// parentheses, holding 8+ digits (so dates "29/09/2026", times "14:00" and
// amounts "R$ 150" are left alone).
const DIGIT_RUN = /\+?\(?\d[\d\s().-]*\d/g;

export function maskPersonalData(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(THAI_ID, "[id]")
    .replace(CPF, "[cpf]")
    .replace(DIGIT_RUN, (m) => {
      if (m.replace(/\D/g, "").length < 8) return m;
      return "[phone]";
    });
}

// The spec's limits on what can be sent (§4.5).
export const MAX_MESSAGE_CHARS = 500;
export const MAX_TURNS = 12;
export const MIN_SECONDS_BETWEEN = 3;
