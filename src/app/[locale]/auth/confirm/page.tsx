import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ConfirmClient from "./ConfirmClient";
import { VerifyClient } from "../verify/VerifyClient";
import type { Metadata } from "next";
import { isFirstConfirmation } from "@/lib/firstConfirmation";

// Auth links carry one-time codes and tokens in the URL: never index them or
// leak them in referrers.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function AuthConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string; type?: string; token_hash?: string }>;
}) {
  const { locale } = await params;
  const { code, type, token_hash: tokenHash } = await searchParams;

  // One-time token links (the send-email hook builds <redirect_to>?token_hash
  // for app-origin emails) are never verified on load: mail scanners open
  // links first and would burn the token. Same click-to-verify page as
  // /auth/verify; an app account is then handed back to the app.
  if (!code && tokenHash) {
    return <VerifyClient locale={locale} tokenHash={tokenHash} type={type ?? "signup"} appHandoff />;
  }

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

  const prefix = locale === "en" ? "" : `/${locale}`;
  const { access_token, refresh_token } = data.session;
  const platform = data.user.user_metadata?.platform as string | undefined;
  const role = data.user.user_metadata?.role as string | undefined;
  const inviteCode = data.user.user_metadata?.invite_code as string | undefined;

  // Web signup: handle role setup, then redirect appropriately.
  // redirect() from next/navigation in a Server Component correctly carries the
  // session cookies that were set via the cookie store above.
  if (platform === "web") {
    if (role === "secretary") {
      // Server-only linking, same as api/auth/callback/route.ts: the row
      // exists from signup (handle_new_user), and accept_secretary_invite
      // attaches it to the doctor with this user's session, refusing
      // patient and professional accounts itself. On failure the row stays
      // unlinked and the dashboard shows "Not connected".
      const secretaryCode = data.user.user_metadata?.secretary_invite_code as string | undefined;
      if (secretaryCode) {
        const { error: acceptError } = await supabase.rpc("accept_secretary_invite", { p_code: secretaryCode });
        if (acceptError) console.error("Secretary invite accept failed at confirmation:", acceptError.message);
      }
      // Stay in the signup's locale; the dashboard routes linked vs "Not
      // connected".
      redirect(`${prefix}/dashboard`);
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
        redirect(`${prefix}/my-appointments`);
      }
      if (existingRole?.role === "patient" && existingRole.invited_by_professional_id) {
        // Linked to a doctor's "orbit" but not yet confirmed —
        // patient_connections doesn't exist until the doctor confirms.
        redirect(`${prefix}/auth/pending-confirmation`);
      }
      if (existingRole?.role) {
        redirect(`${prefix}/dashboard`);
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
        const { data: fullyLinked, error: linkError } = await supabase.rpc("link_patient_by_invite_code", { p_code: inviteCode });
        if (linkError) {
          // A transient/RPC failure isn't the same as "this code doesn't
          // match anything" — don't cascade into a second call that will
          // fail the same way. invite-required still keeps the session
          // alive either way, so the destination is the same, but the two
          // failure modes shouldn't be conflated in the code.
          redirect(`${prefix}/auth/invite-required`);
        }
        if (fullyLinked) {
          redirect(`${prefix}/auth/patient-welcome`);
        }
        const { data: profId, error: profLinkError } = await supabase.rpc("link_by_professional_public_code", { p_public_code: inviteCode });
        if (profLinkError) {
          redirect(`${prefix}/auth/invite-required`);
        }
        redirect(profId ? `${prefix}/auth/pending-confirmation` : `${prefix}/auth/invite-required`);
      }
      redirect(`${prefix}/auth/invite-required`);
    }
    // A professional's email confirmation: the one-time welcome (first-run
    // spec §1), in the signup's locale.
    if (isFirstConfirmation(data.user, type)) {
      redirect(`${prefix}/auth/professional-welcome`);
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
