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
      // invite-required retry form. The linking RPCs below own writing
      // user_roles now, so this only reads.
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("role, invited_by_professional_id, linked_patient_id")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (existingRole?.role === "patient" && existingRole.linked_patient_id) {
        redirect("/my-appointments");
      }
      if (existingRole?.role === "patient" && existingRole.invited_by_professional_id) {
        // Linked to a doctor's "orbit" but not yet confirmed —
        // patient_connections doesn't exist until the doctor confirms.
        redirect("/auth/pending-confirmation");
      }
      if (existingRole?.role) {
        redirect("/dashboard");
      }
      // Two distinct code types, tried in sequence: a patient invite code
      // (tied to a specific pre-existing patient record — link is
      // immediate) or a doctor's public code (pending until the doctor
      // confirms). No valid invite doesn't sign the session out — the
      // account already exists (can't re-signup with the same email), so
      // /auth/invite-required keeps them signed in and offers a retry form.
      // dashboard/layout.tsx's allowlist guard is what actually keeps a
      // role-less session out of the professional dashboard.
      if (inviteCode) {
        const { data: fullyLinked } = await supabase.rpc("link_patient_by_invite_code", { p_code: inviteCode });
        if (fullyLinked) {
          redirect("/auth/patient-welcome");
        }
        const { data: profId } = await supabase.rpc("link_by_professional_public_code", { p_public_code: inviteCode });
        redirect(profId ? "/auth/pending-confirmation" : "/auth/invite-required");
      }
      redirect("/auth/invite-required");
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
