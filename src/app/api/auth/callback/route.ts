import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      const role = data.user.user_metadata?.role as string | undefined;
      if (role === "secretary") {
        await supabase.from("user_roles").upsert(
          { user_id: data.user.id, role: "secretary" },
          { onConflict: "user_id" }
        );
      }
    }
  }

  return NextResponse.redirect(new URL("/dashboard", origin));
}
