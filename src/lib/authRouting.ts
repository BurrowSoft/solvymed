import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isFirstConfirmation } from "@/lib/firstConfirmation";

// Where a user goes right after an auth link established their session,
// shared by /api/auth/callback (PKCE code) and /api/auth/after-verify
// (token links, verified on click). Returns a path including the locale
// prefix. Linking is server-only: this runs the RPCs with the user's own
// session, and the RPCs refuse anything that isn't theirs to do.
export async function routeAfterAuth(
  supabase: SupabaseClient,
  user: Pick<User, "id" | "user_metadata" | "confirmed_at" | "email_confirmed_at">,
  localePrefix: string,
  linkType: string | null | undefined,
): Promise<string> {
  const meta = user.user_metadata ?? {};
  const role = meta.role as string | undefined;
  const inviteCode = meta.invite_code as string | undefined;

  if (role === "secretary") {
    // handle_new_user created the row at signup (role secretary, no link);
    // accept_secretary_invite attaches it to the doctor, keyed on this
    // session's auth.uid() and email, and refuses patient and professional
    // accounts itself. On failure (revoked or expired invite) the row stays
    // unlinked and dashboard/layout.tsx shows "Not connected".
    const secretaryCode = meta.secretary_invite_code as string | undefined;
    if (secretaryCode) {
      const { error } = await supabase.rpc("accept_secretary_invite", { p_code: secretaryCode });
      if (error) console.error("Secretary invite accept failed at confirmation:", error.code ?? "error");
    }
    return `${localePrefix}/dashboard`;
  }

  if (role === "patient") {
    // Never touch an existing role; the linking RPCs own user_roles.
    const { data: existingRole } = await supabase
      .from("user_roles")
      .select("role, invited_by_professional_id, linked_patient_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingRole?.role === "patient" && existingRole.linked_patient_id) return `${localePrefix}/my-appointments`;
    // Linked to a doctor's "orbit" but not yet confirmed by the doctor.
    if (existingRole?.role === "patient" && existingRole.invited_by_professional_id) return `${localePrefix}/auth/pending-confirmation`;
    if (existingRole?.role) return `${localePrefix}/dashboard`;
    if (!inviteCode) {
      // No invite code, no doctor to link to: /auth/invite-required keeps
      // the session and offers a retry form.
      return `${localePrefix}/auth/invite-required`;
    }
    // A patient invite code (links immediately) or a doctor's public code
    // (pending until the doctor confirms). A failed RPC is not "no match",
    // so it doesn't cascade into the second call.
    const { data: fullyLinked, error: linkError } = await supabase.rpc("link_patient_by_invite_code", { p_code: inviteCode });
    if (linkError) return `${localePrefix}/auth/invite-required`;
    if (fullyLinked) return `${localePrefix}/auth/patient-welcome`;
    const { data: profId, error: profLinkError } = await supabase.rpc("link_by_professional_public_code", { p_public_code: inviteCode });
    if (profLinkError || !profId) return `${localePrefix}/auth/invite-required`;
    return `${localePrefix}/auth/pending-confirmation`;
  }

  // Professional (the default). handle_new_user creates the row at signup;
  // a session with no row at all is, in practice, a patient mid-signup.
  const { data: existingRole, error: roleLookupError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!roleLookupError && !existingRole?.role) return `${localePrefix}/auth/invite-required`;
  // The link that just confirmed a new professional: the one-time welcome
  // (first-run spec §1). Later logins go to the dashboard.
  if (existingRole?.role === "professional" && isFirstConfirmation(user, linkType)) {
    return `${localePrefix}/auth/professional-welcome`;
  }
  // dashboard/layout.tsx routes every persisted role (and fails closed on a
  // lookup error).
  return `${localePrefix}/dashboard`;
}
