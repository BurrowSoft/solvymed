import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      const meta = data.user.user_metadata ?? {};
      const role = meta.role as string | undefined;
      const inviteCode = meta.invite_code as string | undefined;

      if (role === "secretary") {
        await supabase.from("user_roles").upsert(
          { user_id: data.user.id, role: "secretary" },
          { onConflict: "user_id" }
        );
        return NextResponse.redirect(new URL("/dashboard", origin));
      }

      if (role === "patient" && inviteCode) {
        const { data: rpcData } = await supabase.rpc("patient_by_invite_code", { code: inviteCode });
        if (rpcData?.length) {
          await supabase.from("user_roles").upsert(
            { user_id: data.user.id, role: "patient", linked_patient_id: rpcData[0].patient_id },
            { onConflict: "user_id" }
          );
        }
        return NextResponse.redirect(new URL("/auth/patient-welcome", origin));
      }

      // professional (default)
      return NextResponse.redirect(new URL("/dashboard", origin));
    }
  }

  return NextResponse.redirect(new URL("/", origin));
}
