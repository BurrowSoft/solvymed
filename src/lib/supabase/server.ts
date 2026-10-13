import { cache } from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { ACTING_COOKIE, ALL_PRACTICES, actingHeaders, allFallbackId, type MyPractice } from '@/lib/actingPractice';
import { liveFeatures } from '@/lib/liveFeatures';
import { rowPracticeOverride } from '@/lib/rowPractice';

// "Todos" with her primary doctor's subscription lapsed (d1/cf): the pages
// other than the Agenda act for her first active doctor instead (null: her
// primary, as before). Once per request, read without the acting header.
const allModeFallback = cache(async (): Promise<string | null> => {
  if (!liveFeatures.multiPractice) return null;
  const supabase = await createClient({ acting: false });
  const { data, error } = await supabase.rpc('get_my_practices');
  return error ? null : allFallbackId((data ?? []) as MyPractice[]);
});

// acting: false = without the x-acting-practice header (the secretary's
// practice list and the stale-choice check must not depend on it).
export async function createClient(opts: { acting?: boolean } = {}) {
  const cookieStore = await cookies();
  // The "All" schedule's row (166) overrides the switcher, for that action only.
  const chosen = opts.acting === false ? undefined : rowPracticeOverride() ?? cookieStore.get(ACTING_COOKIE)?.value;
  const headers = opts.acting === false ? {} : actingHeaders(chosen === ALL_PRACTICES ? await allModeFallback() : chosen);
  const client = createServerClient(
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
  // Every server getUser refreshes once if the token turns out to be expired
  // (1.9.0, ec on #521): a device clock that's off stores a token expiry
  // shifted to its own clock, which this client would otherwise trust and
  // the doctor would look signed out (lib/supabase/userWithRefresh, as the
  // middleware does).
  if (typeof client.auth?.getUser !== 'function') return client;
  const plainGetUser = client.auth.getUser.bind(client.auth);
  client.auth.getUser = (async (jwt?: string) => {
    if (jwt) return plainGetUser(jwt);
    const first = await plainGetUser();
    if (first.data.user || !first.error || first.error.name === 'AuthSessionMissingError') return first;
    const refreshed = await client.auth.refreshSession();
    return refreshed.error ? first : plainGetUser();
  }) as typeof client.auth.getUser;
  return client;
}
