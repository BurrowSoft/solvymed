// Privacy §6e: the channels whose patient notices wait in an outbox, only
// those live (policy = what runs). Push (and LINE, when it's live) wait
// with 135's outbox; WhatsApp with 137's. Called only when WhatsApp is live.
export function noticeChannels(outbox: boolean, line: boolean, or: string): string {
  const list = [...(outbox ? ["push", ...(line ? ["LINE"] : [])] : []), "WhatsApp"];
  return list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} ${or} ${list[list.length - 1]}`;
}
