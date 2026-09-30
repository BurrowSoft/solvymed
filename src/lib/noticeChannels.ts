// Privacy §6e: the channels whose patient notices wait ~1 minute in an
// outbox with a 30-day record, only those live (policy = what runs): push
// with 135's outbox, WhatsApp with 137's. LINE is not here: its history is
// kept 90 days (122) and its hold is another migration (136), so it's
// covered in §6c instead (9a). Called only when WhatsApp is live.
export function noticeChannels(outbox: boolean, or: string): string {
  return outbox ? `push ${or} WhatsApp` : "WhatsApp";
}
