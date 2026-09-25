"use client";

import { createClient } from "@/lib/supabase/client";
import { useParams, useRouter } from "next/navigation";

export function SignOutButton({ label = "Sign out" }: { label?: string }) {
  const router = useRouter();
  const params = useParams<{ locale?: string }>();
  // Land on the home page in the language the user was in.
  const locale = params?.locale;
  const home = locale && locale !== "en" ? `/${locale}` : "/";

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push(home);
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
    >
      {label}
    </button>
  );
}
