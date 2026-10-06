// The app's lib/whatsapp-number.ts (one rule on both platforms; change both
// together): the number wa.me needs (country code + number, digits only)
// from a phone as the clinic typed it, by the PRACTICE's country: a
// Brazilian "(11) 99999-9999" → 5511999999999, a Thai "081 234 5678" →
// 66812345678. A number typed with its own "+country" is kept as is. null
// when there are too few digits to be a phone.
import { countryProfile } from "./country";

// Digits (country code included) from which a number already carries its code.
const INTERNATIONAL_MIN: Record<string, number> = { "55": 12, "66": 10 };

export function whatsappNumber(phone: string | null | undefined, practiceCountry?: string | null): string | null {
  const raw = (phone ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (raw.startsWith("+") || raw.startsWith("00")) return digits.replace(/^00/, "");
  const prefix = (countryProfile(practiceCountry).phonePrefix ?? "").replace("+", "");
  if (!prefix) return digits;
  // BR national numbers are 10–11 digits (DDD 55 exists), so 55… counts as
  // carrying the code from 12; TH national is 8–9 without the trunk 0, so
  // 66… from 10.
  const withCode = INTERNATIONAL_MIN[prefix] ?? 12;
  if (digits.startsWith(prefix) && digits.length >= withCode) return digits;
  return prefix + digits.replace(/^0+/, "");
}

// https://wa.me/<number>?text=…; null when the phone isn't a phone.
export function whatsappLink(phone: string | null | undefined, practiceCountry: string | null | undefined, text: string): string | null {
  const n = whatsappNumber(phone, practiceCountry);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

// The app's lib/pix-message.ts: Pix is Brazil-only, so the message a
// PATIENT receives with the Pix code is always pt-BR, whatever language the
// clinic reads. The code stays alone on the last line so a long-press
// copies only it.
// 1.8.0 E (cf): with the doctor's card payment link, a line before the copy
// instruction offers it.
export function pixPatientMessage(date: string, time: string, code: string, cardLink: string | null = null): string {
  const { d, t } = ptBrVisit(date, time);
  return `Olá! Segue o Pix da sua consulta em ${d} às ${t}.`
    + (cardLink ? `\nOu pague com cartão: ${cardLink}\n` : " ")
    + `Copie o código abaixo e cole em "Pix Copia e Cola" no app do seu banco:\n${code}`;
}

// 1.8.0 E (cf): a Brazilian practice with a card link and no Pix key sends
// the link alone (pt-BR, as the Pix message: Brazil only).
export function cardPatientMessage(date: string, time: string, link: string): string {
  const { d, t } = ptBrVisit(date, time);
  return `Olá! Para pagar sua consulta em ${d} às ${t} com cartão, use este link: ${link}`;
}

// 2026-09-28 / 9:5 → 28/09/2026 / 09:05, whatever the clinic's language.
function ptBrVisit(date: string, time: string): { d: string; t: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const [h = "0", mi = "0"] = time.split(":");
  return { d: m ? `${m[3]}/${m[2]}/${m[1]}` : date, t: `${h.padStart(2, "0")}:${mi.padStart(2, "0")}` };
}
