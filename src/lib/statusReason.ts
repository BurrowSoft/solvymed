import { conditionMet } from "@/lib/conditions";

// Item 12 (migration 150, mobile #238): the clinic's optional reason on a
// reject or cancel (status_reason) and its message on Confirm/Propose
// (clinic_message), both shown to the patient on their appointment; pushes
// never carry clinic free text, only "…with a message from the clinic".
// status_by ('clinic' | 'patient') is set by 150's trigger, never by us.
export const REASON_MAX = 200;

export function statusReasonLive(): boolean {
  return conditionMet("status-reason-live");
}

// What's written: trimmed, at most 200 characters (the database refuses
// longer), null when blank.
export function cleanReason(text: string | null | undefined): string | null {
  const t = (text ?? "").trim().slice(0, REASON_MAX);
  return t ? t : null;
}
