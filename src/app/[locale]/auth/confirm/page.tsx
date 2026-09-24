import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ConfirmClient from "./ConfirmClient";

export default async function AuthConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string; type?: string }>;
}) {
  const { locale } = await params;
  const { code, type } = await searchParams;

  if (!code) {
    return <ConfirmClient state="unknown" deepLink="solvymed://" />;
  }

  // createClient() uses next/headers cookies() which correctly propagates
  // session cookies through Server Component redirects (unlike Route Handlers).
  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return <ConfirmClient state="unknown" deepLink="solvymed://" />;
  }

  const { access_token, refresh_token } = data.session;
  const platform = data.user.user_metadata?.platform as string | undefined;
  const role = data.user.user_metadata?.role as string | undefined;
  const joinProfId = data.user.user_metadata?.join_professional_id as string | undefined;
  const joinRole = data.user.user_metadata?.join_role as string | undefined;
  const inviteCode = data.user.user_metadata?.invite_code as string | undefined;

  // Web signup: handle role setup, then redirect appropriately.
  // redirect() from next/navigation in a Server Component correctly carries the
  // session cookies that were set via the cookie store above.
  if (platform === "web") {
    // If joining via invite link, complete the join flow on the /join page.
    if (joinProfId) {
      redirect(`/join/${joinProfId}?role=${joinRole ?? "patient"}`);
    }
    if (role === "secretary") {
      await supabase.from("user_roles").upsert(
        { user_id: data.user.id, role: "secretary" },
        { onConflict: "user_id" },
      );
    }
    if (role === "patient") {
      // Refuse to touch an existing role — matches the guard on the
      // invite-required retry form. An onConflict upsert would otherwise
      // silently overwrite an existing professional/secretary/already-
      // linked-patient row if this handler ever ran for such an account.
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (existingRole?.role) {
        redirect(existingRole.role === "patient" ? "/my-appointments" : "/dashboard");
      }
      // Same invite-required rule as /api/auth/callback — no doctor to link
      // to without a code, so no patient role gets created.
      let linked = false;
      if (inviteCode) {
        const { data: patientData } = await supabase.rpc("patient_by_invite_code", { code: inviteCode });
        if (patientData?.length) {
          const { error: upsertError } = await supabase.from("user_roles").upsert(
            { user_id: data.user.id, role: "patient", linked_patient_id: patientData[0].patient_id },
            { onConflict: "user_id" },
          );
          linked = !upsertError;
        } else {
          const { data: profData } = await supabase.rpc("professional_by_invite_code", { code: inviteCode });
          if (profData?.length) {
            const { error: upsertError } = await supabase.from("user_roles").upsert(
              { user_id: data.user.id, role: "patient", invited_by_professional_id: profData[0].professional_id },
              { onConflict: "user_id" },
            );
            linked = !upsertError;
          }
        }
      }
      // No valid invite doesn't sign the session out — the account already
      // exists (can't re-signup with the same email), so /auth/invite-required
      // keeps them signed in and offers a retry form to attach a valid code.
      // dashboard/layout.tsx's allowlist guard is what actually keeps a
      // role-less session out of the professional dashboard.
      redirect(linked ? "/auth/patient-welcome" : "/auth/invite-required");
    }
    // Redirect to /dashboard without a locale prefix — the middleware's
    // geo-redirect will add the correct locale (e.g. /th/dashboard) automatically.
    redirect("/dashboard");
  }

  // Mobile signup: pass tokens to client for deep-link redirect
  const linkType = type ?? "signup";
  const deepLink = `solvymed://?access_token=${encodeURIComponent(access_token)}&refresh_token=${encodeURIComponent(refresh_token)}&type=${linkType}`;
  const state = linkType === "recovery" ? "recovery" : "signup";

  return <ConfirmClient state={state} deepLink={deepLink} autoRedirect />;
}
