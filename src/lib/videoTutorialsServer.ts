import "server-only";
import { createClient } from "@/lib/supabase/server";
import { lookupPracticeCountry } from "@/lib/practiceCountry";
import { videoTutorialsUrl } from "@/lib/videoTutorials";

// The playlist for whoever is viewing a public page: a doctor or secretary
// gets their practice country's; everyone else (visitors, patients) the site
// language's (specs/video-tutorials.md). A failed lookup falls back to the
// language's: never another country's playlist.
export async function viewerVideoTutorialsUrl(locale: string): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: role } = await supabase
        .from("user_roles")
        .select("role, invited_by_professional_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const practiceId = role?.role === "professional" ? user.id : role?.role === "secretary" ? role.invited_by_professional_id : null;
      if (practiceId) {
        const r = await lookupPracticeCountry(supabase, user.id, practiceId);
        if (r.ok) return videoTutorialsUrl({ country: r.country });
      }
    }
  } catch {
    // The language's playlist, below.
  }
  return videoTutorialsUrl({ locale });
}
