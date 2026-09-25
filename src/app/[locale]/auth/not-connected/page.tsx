import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { SignOutButton } from "@/components/SignOutButton";
import { SecretaryCodeForm } from "./SecretaryCodeForm";

// For a secretary with no link to a doctor: never accepted an invite, was
// removed, or left. No dashboard and no paywall, just a way to enter an
// invite code. Anyone else is sent to the dashboard, which routes them.
export default async function NotConnectedPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const prefix = locale === "en" ? "" : `/${locale}`;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`${prefix}/auth/login`);

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role, invited_by_professional_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleRow?.role !== "secretary" || roleRow.invited_by_professional_id) redirect(`${prefix}/dashboard`);

  const t = await getTranslations({ locale, namespace: "secretary" });
  return (
    <AuthPageShell>
      <AuthCard>
        <h1 className="auth-heading text-center">{t("notConnectedTitle")}</h1>
        <p className="mb-6 text-center text-slate-500">{t("notConnectedBody")}</p>
        <SecretaryCodeForm locale={locale} />
        <div className="mt-6 flex justify-center">
          <SignOutButton label={t("signOut")} />
        </div>
      </AuthCard>
    </AuthPageShell>
  );
}
