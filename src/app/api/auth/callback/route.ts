import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/", origin));
  }

  // Collect cookies Supabase wants to set — we'll apply them to the final redirect response.
  // Using next/headers cookies() here would NOT attach to a manually-created NextResponse,
  // so we buffer them and apply explicitly instead.
  type CookieTuple = { name: string; value: string; options: Record<string, unknown> };
  const pendingCookies: CookieTuple[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => { pendingCookies.push(...cookies); },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  let redirectUrl: URL;

  if (!error && data.session) {
    const meta = data.user.user_metadata ?? {};
    const role = meta.role as string | undefined;
    const inviteCode = meta.invite_code as string | undefined;

    if (role === "secretary") {
      await supabase.from("user_roles").upsert(
        { user_id: data.user.id, role: "secretary" },
        { onConflict: "user_id" },
      );
      redirectUrl = new URL("/dashboard", origin);
    } else if (role === "patient") {
      if (inviteCode) {
        const { data: patientData } = await supabase.rpc("patient_by_invite_code", { code: inviteCode });
        if (patientData?.length) {
          await supabase.from("user_roles").upsert(
            { user_id: data.user.id, role: "patient", linked_patient_id: patientData[0].patient_id },
            { onConflict: "user_id" },
          );
        } else {
          const { data: profData } = await supabase.rpc("professional_by_invite_code", { code: inviteCode });
          if (profData?.length) {
            await supabase.from("user_roles").upsert(
              { user_id: data.user.id, role: "patient", invited_by_professional_id: profData[0].professional_id },
              { onConflict: "user_id" },
            );
          } else {
            await supabase.from("user_roles").upsert(
              { user_id: data.user.id, role: "patient" },
              { onConflict: "user_id" },
            );
          }
        }
      } else {
        await supabase.from("user_roles").upsert(
          { user_id: data.user.id, role: "patient" },
          { onConflict: "user_id" },
        );
      }
      redirectUrl = new URL("/auth/patient-welcome", origin);
    } else {
      // professional (default)
      redirectUrl = new URL("/dashboard", origin);
    }
  } else {
    redirectUrl = new URL("/", origin);
  }

  const response = NextResponse.redirect(redirectUrl);
  pendingCookies.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]),
  );
  return response;
}
