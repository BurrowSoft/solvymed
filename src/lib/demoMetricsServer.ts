import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// The demo counters the web server counts (238's demo_count_server, service role only):
// page_load (the /demo render; bots included, it's the denominator) and
// signup_from_demo. A no-op off Production and while server_flags.demo_metrics is off;
// never throws, so a
// count never breaks a page or a sign-in.
export async function demoCountServer(metric: "page_load" | "signup_from_demo", country: string, locale: string): Promise<void> {
  // Only Production counts: previews share the production database (cf, #615).
  if (process.env.VERCEL_ENV !== "production") return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    const admin = createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    await admin.rpc("demo_count_server", { p_metric: metric, p_country: country, p_locale: locale });
  } catch {
    // Counting is best-effort.
  }
}
