import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "signup") as EmailOtpType;

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
      redirectUrl = new URL(`/join/${joinProfId}?role=${joinRole ?? "patient"}`, origin);

    } else if (role === "secretary") {
      await supabase.from("user_roles").upsert(
        { user_id: sessionUser.id, role: "secretary" },
        { onConflict: "user_id" },
      );
      redirectUrl = new URL("/dashboard", origin);

    } else if (role === "patient") {
      // An invite code is required for patients — without one there's no doctor
      // to link them to, so they don't get a patient role at all (see
      // /auth/invite-required, which explains why and sends them back to sign up
      // with a code).
      let linked = false;
      if (inviteCode) {
        const { data: patientData } = await supabase.rpc("patient_by_invite_code", { code: inviteCode });
        if (patientData?.length) {
          await supabase.from("user_roles").upsert(
            { user_id: sessionUser.id, role: "patient", linked_patient_id: patientData[0].patient_id },
            { onConflict: "user_id" },
          );
          linked = true;
        } else {
          const { data: profData } = await supabase.rpc("professional_by_invite_code", { code: inviteCode });
          if (profData?.length) {
            await supabase.from("user_roles").upsert(
              { user_id: sessionUser.id, role: "patient", invited_by_professional_id: profData[0].professional_id },
              { onConflict: "user_id" },
            );
            linked = true;
          }
        }
      }
      if (linked) {
        redirectUrl = new URL("/auth/patient-welcome", origin);
      } else {
        // No valid invite — don't leave an authenticated, role-less session
        // sitting around (it would fall through dashboard's guard, which
        // only special-cases "patient", not "no role").
        await supabase.auth.signOut();
        redirectUrl = new URL("/auth/invite-required", origin);
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
