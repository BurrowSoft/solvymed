function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(id: string, value: string): string {
  return id + value.length.toString().padStart(2, '0') + value;
}

function sanitize(s: string, max: number): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, max);
}

export function generatePixString(
  pixKey: string,
  merchantName: string,
  merchantCity: string,
  amount?: number,
): string {
  const name = sanitize(merchantName, 25) || 'SOLVYMED';
  const city = sanitize(merchantCity, 15) || 'BRASIL';

  const merchantAccount = tlv('0014', 'br.gov.bcb.pix') + tlv('01', pixKey.trim());
  const additionalData = tlv('05', '***');

  let payload = '';
  payload += tlv('00', '01');
  payload += tlv('26', merchantAccount);
  payload += tlv('52', '0000');
  payload += tlv('53', '986');
  if (amount != null && amount > 0) payload += tlv('54', amount.toFixed(2));
  payload += tlv('58', 'BR');
  payload += tlv('59', name);
  payload += tlv('60', city);
  payload += tlv('62', additionalData);
  payload += '6304';

  return payload + crc16(payload);
}

export function pixQrUrl(pixString: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixString)}`;
}
