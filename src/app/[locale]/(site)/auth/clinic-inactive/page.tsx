import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AuthPageShell } from "@/components/AuthPageShell";
import { AuthCard } from "@/components/AuthCard";
import { SignOutButton } from "@/components/SignOutButton";

type MyClinic = { professional_name: string | null; subscription_active: boolean | null };

// A linked secretary whose doctor's subscription has lapsed. The secretary
// can't pay for it, so this replaces the paywall with a plain explanation.
// Access comes back on its own when the doctor renews.
export default async function ClinicInactivePage({ params }: { params: Promise<{ locale: string }> }) {
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
  if (roleRow?.role !== "secretary" || !roleRow.invited_by_professional_id) redirect(`${prefix}/dashboard`);

  const { data, error } = await supabase.rpc("get_my_clinic");
  const clinic = (!error && Array.isArray(data) ? data[0] : null) as MyClinic | null;
  // Renewed since the dashboard sent them here: go straight back.
  if (clinic?.subscription_active) redirect(`${prefix}/dashboard`);

  const t = await getTranslations({ locale, namespace: "secretary" });
  return (
    <AuthPageShell>
      <AuthCard centered>
        <h1 className="auth-heading">{t("clinicInactiveTitle")}</h1>
        <p className="mb-8 text-slate-500">
          {clinic?.professional_name
            ? t("clinicInactiveBody", { name: clinic.professional_name })
            : t("clinicInactiveBodyGeneric")}
        </p>
        <SignOutButton label={t("signOut")} />
      </AuthCard>
    </AuthPageShell>
  );
}
