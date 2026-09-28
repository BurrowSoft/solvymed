import qrcode from "qrcode-generator";
import { crc16, tlv } from "./emv";

// Merchant name and city: ASCII only (accents stripped, other symbols
// dropped), upper case, single spaces, at most `max` characters.
export function sanitizePixText(s: string, max: number): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/ +/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, max)
    .trim();
}

// The static Pix BR Code (EMV MPM) from already-valid field values, as in
// the BCB "Manual de Padrões para Iniciação do Pix". Field 26 is the
// merchant account: GUI "br.gov.bcb.pix" in sub-field 00, the key in 01.
export function buildPixPayload(f: { key: string; name: string; city: string; amount?: string; txid?: string }): string {
  let payload = '';
  payload += tlv('00', '01');
  payload += tlv('26', tlv('00', 'br.gov.bcb.pix') + tlv('01', f.key));
  payload += tlv('52', '0000');
  payload += tlv('53', '986');
  if (f.amount) payload += tlv('54', f.amount);
  payload += tlv('58', 'BR');
  payload += tlv('59', f.name);
  payload += tlv('60', f.city);
  payload += tlv('62', tlv('05', f.txid ?? '***'));
  payload += '6304';
  return payload + crc16(payload);
}

export function generatePixString(
  pixKey: string,
  merchantName: string,
  merchantCity: string,
  amount?: number,
): string {
  return buildPixPayload({
    key: pixKey.trim(),
    name: sanitizePixText(merchantName, 25) || 'SOLVYMED',
    city: sanitizePixText(merchantCity, 15) || 'BRASIL',
    amount: amount != null && amount > 0 ? amount.toFixed(2) : undefined,
  });
}

// The Pix QR, generated in the page. The payload holds the practice's Pix
// key, name and the amount, so it must never be sent to a third-party QR
// service. Scannability (same rules as the app): error correction M, black
// on white, 5 px modules (>= 4) and a quiet zone of 4 modules. The payload
// is ASCII (generatePixString strips accents).
export const PIX_QR_MODULE_PX = 5;
export const PIX_QR_QUIET_MODULES = 4;

export function makePixQr(pixString: string) {
  const qr = qrcode(0, "M");
  qr.addData(pixString);
  qr.make();
  return qr;
}

// A GIF data URL (createDataURL's margin is in pixels, not modules).
export function pixQrDataUrl(pixString: string): string {
  return makePixQr(pixString).createDataURL(PIX_QR_MODULE_PX, PIX_QR_MODULE_PX * PIX_QR_QUIET_MODULES);
}
