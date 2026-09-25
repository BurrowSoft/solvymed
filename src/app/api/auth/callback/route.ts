import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { routing } from "@/i18n/routing";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "signup") as EmailOtpType;

  // No [locale] segment here (this is a Route Handler, not a page under
  // [locale]), so the only signal for which locale the signup happened in
  // is the NEXT_LOCALE cookie next-intl's own middleware keeps in sync with
  // whatever locale-prefixed page the user was last on.
  const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
  const locale = (routing.locales as readonly string[]).includes(cookieLocale ?? "")
    ? (cookieLocale as string)
    : routing.defaultLocale;
  const localePrefix = locale === routing.defaultLocale ? "" : `/${locale}`;

  // Must have either a PKCE code or an OTP token_hash
  if (!code && !tokenHash) {
    return NextResponse.redirect(new URL("/", origin));
  }

  // Collect cookies Supabase wants to set — we'll apply them to the final redirect response.
  // next/headers cookies() would NOT attach to a manually-created NextResponse,
  // so we buffer them and apply explicitly instead.
  const pendingCookies: Array<Record<string, unknown> & { name: string; value: string }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => {
            pendingCookies.push({ name, value, ...(options ?? {}) });
          });
        },
      },
    },
  );

  // Use explicit if/else to avoid TypeScript union issues between
  // exchangeCodeForSession (AuthResponse) and verifyOtp (AuthOtpResponse).
  let sessionUser: { id: string; user_metadata: Record<string, unknown> } | null = null;
  let sessionExists = false;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session && data.user) {
      sessionUser = data.user;
      sessionExists = true;
    }
  } else if (tokenHash) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error && data.session && data.user) {
      sessionUser = data.user as unknown as typeof sessionUser;
      sessionExists = true;
    }
  }

  let redirectUrl: URL;

  if (sessionExists && sessionUser) {
    const meta = sessionUser.user_metadata ?? {};
    const role = meta.role as string | undefined;
    const inviteCode = meta.invite_code as string | undefined;
    const joinProfId = meta.join_professional_id as string | undefined;
    const joinRole = meta.join_role as string | undefined;

    if (joinProfId) {
      // Signed up via a doctor's direct join link — the /join page does the
      // actual role/link setup itself, same as the mobile-facing confirm flow.
      redirectUrl = new URL(`${localePrefix}/join/${joinProfId}?role=${joinRole ?? "patient"}`, origin);

    } else if (role === "secretary") {
      await supabase.from("user_roles").upsert(
        { user_id: sessionUser.id, role: "secretary" },
        { onConflict: "user_id" },
      );
      redirectUrl = new URL("/dashboard", origin);

    } else if (role === "patient") {
      // Refuse to touch an existing role — matches the guard on the
      // invite-required retry form. The linking RPCs below own writing
      // user_roles now (see link_patient_by_invite_code /
      // link_by_professional_public_code), so this only reads.
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("role, invited_by_professional_id, linked_patient_id")
        .eq("user_id", sessionUser.id)
        .maybeSingle();

      if (existingRole?.role === "patient" && existingRole.linked_patient_id) {
        redirectUrl = new URL(`${localePrefix}/my-appointments`, origin);
      } else if (existingRole?.role === "patient" && existingRole.invited_by_professional_id) {
        // Linked to a doctor's "orbit" but not yet confirmed — patient_connections
        // doesn't exist until the doctor calls confirm_and_link_patient.
        redirectUrl = new URL(`${localePrefix}/auth/pending-confirmation`, origin);
      } else if (existingRole?.role) {
        redirectUrl = new URL(`${localePrefix}/dashboard`, origin);
      } else if (inviteCode) {
        // Two distinct code types, tried in sequence: a patient invite code
        // (tied to a specific pre-existing patient record — link is
        // immediate, patient_connections created server-side) or a doctor's
        // public code (sets invited_by_professional_id, pending until the
        // doctor confirms).
        const { data: fullyLinked, error: linkError } = await supabase.rpc("link_patient_by_invite_code", { p_code: inviteCode });
        if (linkError) {
          // A transient/RPC failure isn't the same as "this code doesn't
          // match anything" — don't cascade into a second call that will
          // fail the same way. invite-required still keeps the session
          // alive either way, so the destination is the same, but the two
          // failure modes shouldn't be conflated in the code.
          redirectUrl = new URL(`${localePrefix}/auth/invite-required`, origin);
        } else if (fullyLinked) {
          redirectUrl = new URL(`${localePrefix}/auth/patient-welcome`, origin);
        } else {
          const { data: profId, error: profLinkError } = await supabase.rpc("link_by_professional_public_code", { p_public_code: inviteCode });
          redirectUrl = profLinkError
            ? new URL(`${localePrefix}/auth/invite-required`, origin)
            : profId
            ? new URL(`${localePrefix}/auth/pending-confirmation`, origin)
            : new URL(`${localePrefix}/auth/invite-required`, origin);
        }
      } else {
        // An invite code is required for patients — without one there's no
        // doctor to link them to, so they don't get a patient role at all
        // (see /auth/invite-required, which explains why and sends them
        // back to sign up with a code). No valid invite doesn't sign the
        // session out — the account already exists (can't re-signup with
        // the same email), so /auth/invite-required keeps them signed in
        // and offers a retry form to attach a valid code.
        // dashboard/layout.tsx's allowlist guard is what actually keeps a
        // role-less session out of the professional dashboard.
        redirectUrl = new URL(`${localePrefix}/auth/invite-required`, origin);
      }

    } else {
      // professional (default)
      await supabase.from("user_roles").upsert(
        { user_id: sessionUser.id, role: "professional" },
        { onConflict: "user_id" },
      );
      redirectUrl = new URL("/auth/professional-welcome", origin);
    }
  } else {
    // Auth failed — send to login so the user has a clear path forward
    redirectUrl = new URL("/auth/login", origin);
  }

  const response = NextResponse.redirect(redirectUrl);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pendingCookies.forEach(({ name, value, ...rest }) => response.cookies.set(name, value, rest as any));
  return response;
}
