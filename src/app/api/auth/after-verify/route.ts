import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { routing } from "@/i18n/routing";
import { routeAfterAuth } from "@/lib/authRouting";

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

  const redirect = await routeAfterAuth(supabase as unknown as SupabaseClient, user, localePrefix, linkType);
  return NextResponse.json({ redirect });
}
