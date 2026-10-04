"use server";

import { createClient } from "@/lib/supabase/server";
import { isActiveProfessional } from "@/lib/activeAccess";
import { liveFeatures } from "@/lib/liveFeatures";
import { MASS_BODY_MAX, MASS_TITLE_MAX } from "@/lib/massMessage";

// "Enviar para Pacientes" (1.6.0, the app's broadcast; behind
// liveFeatures.broadcast): the doctor's notice to every patient account of
// the practice, sent by the server (enqueue_mass_message, 171). The database
// enforces everything (doctor only, title 1–100, body ≤ 500 and, from 172,
// not blank; 10 per practice per 24 h); this maps its answer to the app's
// messages. Never the secretary (the RPC refuses them too).
export type MassResult =
  | { ok: true; queued: number }
  | { ok: false; code: "titleRequired" | "bodyRequired" | "limitReached" | "failed" };

export async function sendMassMessage(title: string, body: string): Promise<MassResult> {
  if (!liveFeatures.broadcast) return { ok: false, code: "failed" };
  const t = (title ?? "").trim();
  const b = (body ?? "").trim();
  if (!t) return { ok: false, code: "titleRequired" };
  if (!b) return { ok: false, code: "bodyRequired" };
  if (t.length > MASS_TITLE_MAX || b.length > MASS_BODY_MAX) return { ok: false, code: "failed" };
  const supabase = await createClient({ acting: false });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || (await isActiveProfessional(supabase, user.id)) !== true) return { ok: false, code: "failed" };
  const { data, error } = await supabase.rpc("enqueue_mass_message", { p_title: t, p_body: b });
  if (error) {
    const m = error.message ?? "";
    if (m.includes("too_many_notices")) return { ok: false, code: "limitReached" };
    return { ok: false, code: "failed" };
  }
  return { ok: true, queued: typeof data === "number" ? data : 0 };
}
