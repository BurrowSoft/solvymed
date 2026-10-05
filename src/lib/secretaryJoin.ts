import type { SupabaseClient } from "@supabase/supabase-js";
import { liveFeatures } from "@/lib/liveFeatures";
import { serverFlag } from "@/lib/myDoctors";

// 0a slice 1b on the website (cf): with multi_practice_secretary on for this
// account, a secretary already on one team may join another doctor's.
// accept_secretary_invite then decides (181: same practice country; the
// team limit; a spent code), so the pages skip their "already in a clinic"
// pre-check and show the "Entrar na equipe de outro médico" card.
export async function canJoinAnotherPractice(supabase: SupabaseClient): Promise<boolean> {
  return liveFeatures.multiPractice && (await serverFlag(supabase, "multi_practice_secretary"));
}
