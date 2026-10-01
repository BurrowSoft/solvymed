// Invited patients (migration 145, Vitor via UX, 1 Oct): a patient who
// signs up with the practice's invite code gets a NEW patient record at once,
// marked as invited. The doctor (or secretary) keeps or removes it. Read only
// once invited-patients-live is met: before 145 these columns don't exist.

export const INVITE_COLUMNS = "invited_via_code_at, invite_reviewed_at, invite_same_email_as";

export type InviteFields = {
  invited_via_code_at?: string | null;
  invite_reviewed_at?: string | null;
  invite_same_email_as?: string | null;
  archived_at?: string | null;
};

// "Novo, via convite": joined with the code, not yet kept or removed, not archived.
export function isNewInvited(p: InviteFields): boolean {
  return !!p.invited_via_code_at && !p.invite_reviewed_at && !p.archived_at;
}

// The RPCs' errors as stable codes for the screens.
export type InviteActionCode = "patient_not_in_this_practice" | "not_an_invited_patient" | "generic";
export function inviteErrorCode(message: string | undefined): InviteActionCode {
  const m = message ?? "";
  if (m.includes("patient_not_in_this_practice")) return "patient_not_in_this_practice";
  if (m.includes("not_an_invited_patient")) return "not_an_invited_patient";
  return "generic";
}
