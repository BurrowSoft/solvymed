import { createBrowserClient } from '@supabase/ssr';
import { actingHeaders, browserActingCookie } from '@/lib/actingPractice';
import { skewAwareFetch } from '@/lib/clockSkew';

export function createClient() {
  // The secretary's chosen doctor (1.5.0, behind the flag): the
  // x-acting-practice header on every request, as on the server.
  const headers = actingHeaders(browserActingCookie());
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // A skewed device clock: token expiries shifted to it (lib/clockSkew).
      global: { ...(Object.keys(headers).length ? { headers } : {}), fetch: skewAwareFetch() },
      // The background token refresh starts only once the device's clock is
      // known to be right (ClockSkewGuard, 1.9.0): a clock an hour fast made
      // it refresh again and again. An expired token is still refreshed on
      // demand by the next request, and the server keeps its cookies fresh.
      auth: { autoRefreshToken: false },
    },
  );
}
