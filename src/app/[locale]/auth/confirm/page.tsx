import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ConfirmClient from "./ConfirmClient";

export default async function AuthConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string; type?: string }>;
}) {
  const { locale } = await params;
  const { code, type } = await searchParams;

  if (!code) {
    return <ConfirmClient state="unknown" deepLink="solvymed://" />;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return <ConfirmClient state="unknown" deepLink="solvymed://" />;
  }

  const { access_token, refresh_token } = data.session;
  const platform = data.user.user_metadata?.platform as string | undefined;
  const role = data.user.user_metadata?.role as string | undefined;

  // Web signup: insert secretary role if needed, then redirect to dashboard
  if (platform === "web") {
    if (role === "secretary") {
      await supabase.from("user_roles").upsert(
        { user_id: data.user.id, role: "secretary" },
        { onConflict: "user_id" }
      );
    }
    const prefix = locale === "en" ? "" : `/${locale}`;
    redirect(`${prefix}/dashboard`);
  }

  // Mobile signup: pass tokens to client for deep-link redirect
  const linkType = type ?? "signup";
  const deepLink = `solvymed://?access_token=${encodeURIComponent(access_token)}&refresh_token=${encodeURIComponent(refresh_token)}&type=${linkType}`;
  const state = linkType === "recovery" ? "recovery" : "signup";

  return <ConfirmClient state={state} deepLink={deepLink} autoRedirect />;
}
