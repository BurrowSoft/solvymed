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

      if (role === "patient") {
        if (inviteCode) {
          // Try patient invite code (links to existing patient record)
          const { data: patientData } = await supabase.rpc("patient_by_invite_code", { code: inviteCode });
          if (patientData?.length) {
            await supabase.from("user_roles").upsert(
              { user_id: data.user.id, role: "patient", linked_patient_id: patientData[0].patient_id },
              { onConflict: "user_id" }
            );
          } else {
            // Try professional public invite code (highlights that doctor in discovery)
            const { data: profData } = await supabase.rpc("professional_by_invite_code", { code: inviteCode });
            if (profData?.length) {
              await supabase.from("user_roles").upsert(
                { user_id: data.user.id, role: "patient", invited_by_professional_id: profData[0].professional_id },
                { onConflict: "user_id" }
              );
            } else {
              // No match — register as patient without linking
              await supabase.from("user_roles").upsert(
                { user_id: data.user.id, role: "patient" },
                { onConflict: "user_id" }
              );
            }
          }
        } else {
          await supabase.from("user_roles").upsert(
            { user_id: data.user.id, role: "patient" },
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
