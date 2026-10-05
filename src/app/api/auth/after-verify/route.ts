import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { routing } from "@/i18n/routing";
import { routeAfterAuth } from "@/lib/authRouting";
import { claimSignupAttribution, recordSignupAttribution } from "@/lib/recordAttribution";
import { ATTRIBUTION_COOKIE, ATTRIBUTION_MAX_AGE_S, ATTRIBUTION_SENT } from "@/lib/attribution";

// Called by /auth/verify after the user clicked Continue and the browser
// verified the one-time token (which set the session cookies). Runs the
// same post-auth routing as the PKCE callback and returns where to go.
// POST only, so link scanners never trigger it.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { locale?: unknown; type?: unknown };
  const locale = typeof body.locale === "string" && (routing.locales as readonly string[]).includes(body.locale)
    ? body.locale
    : routing.defaultLocale;
  const localePrefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  const linkType = typeof body.type === "string" ? body.type : null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ redirect: `${localePrefix}/auth/login` }, { status: 401 });

  // Signup confirmations only ("email" is the newer name for the same OTP).
  const isSignup = linkType === "signup" || linkType === "email";
  const sentAttribution = isSignup
    ? await recordSignupAttribution(supabase as unknown as SupabaseClient, request.cookies)
    : false;
  // G7 (187): the campaign kept with the pending signup, for a confirmation
  // opened in another browser; after the cookie's row, which wins. Always
  // called, so the pending row is deleted either way.
  if (isSignup) await claimSignupAttribution(supabase as unknown as SupabaseClient);

  const redirect = await routeAfterAuth(supabase as unknown as SupabaseClient, user, localePrefix, linkType);
  const response = NextResponse.json({ redirect });
  // First touch is stored (or was already): replace it with a marker, so the
  // page the user lands on next doesn't capture a new, bogus first touch
  // (e.g. landing_path=/auth/professional-welcome). Readable by the banner.
  if (sentAttribution) {
    response.cookies.set(ATTRIBUTION_COOKIE, ATTRIBUTION_SENT, {
      path: "/",
      maxAge: ATTRIBUTION_MAX_AGE_S,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
  }
  return response;
}
