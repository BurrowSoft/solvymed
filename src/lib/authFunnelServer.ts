import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { FunnelMetric, FunnelPlatform } from "./authFunnel";

// +1 to a sign-up funnel total (lib/authFunnel; the mobile developer's
// auth_funnel_count_server, service role only). Like demoCountServer: only Production
// counts (previews share the production database), never throws, and a no-op until
// the function exists or while server_flags.auth_funnel_metrics is off.
// platform: "web" unless the app reported it (p_platform defaults to 'web' in the RPC).
export async function authFunnelCount(metric: FunnelMetric, country: string | null, locale: string, platform: FunnelPlatform = "web"): Promise<void> {
  if (process.env.VERCEL_ENV !== "production") return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    const admin = createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    await admin.rpc("auth_funnel_count_server", { p_metric: metric, p_country: country ?? "??", p_locale: locale, ...(platform === "web" ? {} : { p_platform: platform }) });
  } catch {
    // Counting is best-effort.
  }
}
