import { crc16, tlv } from "./emv";

// PromptPay, Thailand's payment QR (Sprint TH, TH-4): the EMVCo payload of
// the Thai QR Payment standard, the same bytes as the app (layout agreed
// with the mobile dev; cross-checked with the MIT "promptpay-qr" library):
//   00 "01"                     payload format
//   01 "11" | "12"              static; "12" (dynamic) when an amount is set
//   29 merchant account         00 AID A000000677010111, then
//                                 01 phone: 0066 + the number without its 0
//                                 02 13-digit national ID / tax ID
//   58 "TH"                     country
//   53 "764"                    currency (THB)
//   54 amount                   two decimals, only when > 0
//   63 CRC                      CRC-16/CCITT-FALSE, upper-case hex

const PROMPTPAY_AID = "A000000677010111";

// A PromptPay ID as migration 110 stores it: a 10-digit mobile number
// starting with 0, or a 13-digit national / tax ID. Separators are
// dropped and an international mobile (+66 8…) becomes 08…; anything else
// is not a PromptPay ID (null).
export function normalizePromptPayId(raw: string | null | undefined): string | null {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (/^\s*\+66/.test(raw ?? "") && digits.length === 11) digits = "0" + digits.slice(2);
  return /^(0\d{9}|\d{13})$/.test(digits) ? digits : null;
}

export function generatePromptPayString(promptPayId: string, amount?: number | null): string {
  const id = normalizePromptPayId(promptPayId);
  if (!id) throw new Error("invalid PromptPay ID");
  const account = id.length === 13
    ? tlv("02", id)
    : tlv("01", ("66" + id.slice(1)).padStart(13, "0"));
  const hasAmount = amount != null && amount > 0;
  let payload = "";
  payload += tlv("00", "01");
  payload += tlv("01", hasAmount ? "12" : "11");
  payload += tlv("29", tlv("00", PROMPTPAY_AID) + account);
  payload += tlv("58", "TH");
  payload += tlv("53", "764");
  if (hasAmount) payload += tlv("54", amount.toFixed(2));
  payload += "6304";
  return payload + crc16(payload);
}
