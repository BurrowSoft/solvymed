import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAccessAllowed, type EffectiveSub } from "@/lib/subscription";

// The paywall for every dashboard section except Settings (the route group
// doesn't change any URL). A locked doctor goes to /subscribe; Settings stays
// reachable from there (dashboard/layout.tsx explains why). A locked
// secretary never gets here: the dashboard layout already sent them to
// "clinic inactive".
export default async function GatedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale === "en" ? "" : locale + "/"}auth/login`);
  const { data: subRows } = await supabase.rpc("get_effective_subscription", { p_user_id: user.id });
  const sub = (subRows?.[0] ?? null) as EffectiveSub | null;
  if (sub && !isAccessAllowed(sub)) redirect(`/${locale === "en" ? "" : locale + "/"}subscribe`);
  return <>{children}</>;
}
