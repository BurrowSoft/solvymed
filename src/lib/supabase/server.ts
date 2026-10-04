import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { ACTING_COOKIE, actingHeaders } from '@/lib/actingPractice';
import { rowPracticeOverride } from '@/lib/rowPractice';

// acting: false = without the x-acting-practice header (the secretary's
// practice list and the stale-choice check must not depend on it).
export async function createClient(opts: { acting?: boolean } = {}) {
  const cookieStore = await cookies();
  // The "All" schedule's row (166) overrides the switcher, for that action only.
  const headers = opts.acting === false ? {} : actingHeaders(rowPracticeOverride() ?? cookieStore.get(ACTING_COOKIE)?.value);
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(Object.keys(headers).length ? { global: { headers } } : {}),
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    },
  );
}
