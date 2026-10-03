import { createBrowserClient } from '@supabase/ssr';
import { actingHeaders, browserActingCookie } from '@/lib/actingPractice';

export function createClient() {
  // The secretary's chosen doctor (1.5.0, behind the flag): the
  // x-acting-practice header on every request, as on the server.
  const headers = actingHeaders(browserActingCookie());
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    Object.keys(headers).length ? { global: { headers } } : undefined,
  );
}
