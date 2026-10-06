// Where a signed-in visitor of the landing page goes (moved from the page to
// the middleware so the landing can be static; same rules as before).
// The persisted role is authoritative: user_metadata is client-writable, so
// it only decides the one case with no persisted role yet (a pending patient
// whose invite never resolved).

export type LandingRole = { role?: string | null; invited_by_professional_id?: string | null; linked_patient_id?: string | null } | null;

export function landingDestination(roleRow: LandingRole, metadataRole: unknown, prefix: string): string {
  if (roleRow?.role === "patient" && roleRow.linked_patient_id) return `${prefix}/my-appointments`;
  if (roleRow?.role === "patient" && roleRow.invited_by_professional_id) return `${prefix}/auth/pending-confirmation`;
  if (roleRow?.role === "patient") return `${prefix}/my-appointments`;
  if (!roleRow?.role && metadataRole === "patient") return `${prefix}/auth/invite-required`;
  if (secretaryWithoutTeam(roleRow)) return `${prefix}/auth/not-connected`;
  return `${prefix}/dashboard`;
}

// A secretary with no practice left (never accepted, removed, or left: the
// DB clears her primary link and promotes another practice when she has
// one, 163). She never gets the dashboard: "not part of any team" (cf).
export function secretaryWithoutTeam(roleRow: LandingRole): boolean {
  return roleRow?.role === "secretary" && !roleRow.invited_by_professional_id;
}

// The landing page's paths: "/" and "/<locale>" (with or without a slash).
export function isLandingPath(pathname: string, locales: readonly string[]): boolean {
  if (pathname === "/") return true;
  const m = /^\/([^/]+)\/?$/.exec(pathname);
  return !!m && locales.includes(m[1]);
}
