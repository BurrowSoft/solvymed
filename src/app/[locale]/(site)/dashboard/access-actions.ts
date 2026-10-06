"use server";

import { createClient } from "@/lib/supabase/server";
import { liveFeatures } from "@/lib/liveFeatures";
import { myPractices } from "@/lib/effectiveProfId";
import { teamAccessKey } from "@/lib/teamAccess";

// The signed-in secretary's current teams (lib/teamAccess), read without the
// acting header. null on any failure: the watcher then does nothing.
export async function currentTeamAccess(): Promise<string | null> {
  const supabase = await createClient({ acting: false });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("user_roles")
    .select("role, invited_by_professional_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || data?.role !== "secretary") return null;
  if (!liveFeatures.multiPractice) return teamAccessKey(data.invited_by_professional_id, null);
  const list = await myPractices(user.id);
  return list ? teamAccessKey(data.invited_by_professional_id, list.map((p) => p.professional_id)) : null;
}
