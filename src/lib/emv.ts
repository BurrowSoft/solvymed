// EMVCo merchant-presented QR building blocks, shared by Pix (Brazil) and
// PromptPay (Thailand).

// CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF), four upper-case hex digits,
// over the payload up to and including the "6304" CRC tag.
export function crc16(data: string): string {
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

// One field: id, two-digit length, value.
export function tlv(id: string, value: string): string {
  return id + value.length.toString().padStart(2, '0') + value;
}
