import { conditionMet } from "@/lib/conditions";
import type { NextRequest } from "next/server";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "./knowledge";

// Who is calling /api/assistant, as a database client that acts as them
// (RLS applies): the app sends its Supabase access token as a Bearer
// header; the website uses the cookie session. The token is verified with
// Supabase Auth by getUser().
export async function assistantCaller(request: NextRequest): Promise<{ db: SupabaseClient; userId: string | null; client: Client }> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (token) {
    const db = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user } } = await db.auth.getUser(token);
    return { db, userId: user?.id ?? null, client: "app" };
  }
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data: { user } } = await db.auth.getUser();
  return { db, userId: user?.id ?? null, client: "web" };
}

// The service client, used by the route ONLY for the usage report and the
// refund of the message it just counted for the verified caller (migration
// 115: those two are service-role only; a9).
export function assistantService(): SupabaseClient {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// The server-only switch for /api/assistant (never a NEXT_PUBLIC_ value:
// nothing a browser or the app sends can turn it on). Read per request.
// AND solvyai-live (cf, 8 Oct): with the Production vars set ahead of the
// go, no build may answer before the flip PR makes the privacy text, Help
// and the App Map true. The app follows /api/assistant/usage, so it too.
export function assistantApiEnabled(): boolean {
  return process.env.SOLVYAI_API_ENABLED === "1" && conditionMet("solvyai-live");
}
