import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { ReloadButton } from "@/components/ReloadButton";
import { TrialBanner } from "@/components/TrialBanner";
import { getTranslations } from "next-intl/server";
import { isAccessAllowed, trialDaysRemaining, type EffectiveSub } from "@/lib/subscription";

function isVersionBelow(current: string, minimum: string): boolean {
  const parse = (v: string) => v.split(".").map(n => parseInt(n, 10) || 0);
  const [cMaj = 0, cMin = 0, cPatch = 0] = parse(current);
  const [mMaj = 0, mMin = 0, mPatch = 0] = parse(minimum);
  if (cMaj !== mMaj) return cMaj < mMaj;
  if (cMin !== mMin) return cMin < mMin;
  return cPatch < mPatch;
}

export default async function DashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/${locale === "en" ? "" : locale + "/"}auth/login`);
  }

  // Patients have no business in the professional dashboard — send them to their own page
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user!.id)
    .maybeSingle();

  if (roleRow?.role === "patient") {
    redirect(`/${locale === "en" ? "" : locale + "/"}discover`);
  }

  // ── Version gate (doctors + secretaries only) ──────────────────────────────
  const { data: appConfig } = await supabase
    .from("app_config")
    .select("min_version")
    .eq("platform", "web")
    .maybeSingle();

  const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.1";
  const versionBlocked = appConfig ? isVersionBelow(currentVersion, appConfig.min_version) : false;

  if (versionBlocked) {
    const t = await getTranslations({ locale, namespace: "versionGate" });
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 p-10 text-center flex flex-col items-center gap-4">
          <span className="text-6xl font-black text-teal-600 leading-none">S</span>
          <h1 className="text-xl font-extrabold text-slate-900">{t("title")}</h1>
          <p className="text-sm text-slate-500 leading-relaxed">{t("body")}</p>
          <ReloadButton label={t("reload")} />
        </div>
      </div>
    );
  }
  // ──────────────────────────────────────────────────────────────────────────

  // ── Subscription gate ───────────────────────────────────────────────────────
  const { data: subRows } = await supabase.rpc("get_effective_subscription", { p_user_id: user.id });
  const sub = (subRows?.[0] ?? null) as EffectiveSub | null;

  if (sub && !isAccessAllowed(sub)) {
    redirect(`/${locale === "en" ? "" : locale + "/"}subscribe`);
  }

  const daysLeft = trialDaysRemaining(sub);
  const showTrialBanner = daysLeft !== null && daysLeft <= 7;
  // ──────────────────────────────────────────────────────────────────────────

  const { data: professional } = await supabase
    .from("professionals")
    .select("full_name, photo_url")
    .eq("id", user.id)
    .maybeSingle();

  const firstName = professional?.full_name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "Doctor";

  let trialBannerLabels = { prefix: "", day: "day", days: "days", cta: "Subscribe" };
  if (showTrialBanner) {
    const t = await getTranslations({ locale, namespace: "subscription" });
    trialBannerLabels = {
      prefix: t("trialBannerPrefix"),
      day: t("trialBannerDay"),
      days: t("trialBannerDays"),
      cta: t("trialBannerCta"),
    };
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <DashboardSidebar
        locale={locale}
        firstName={firstName}
        email={user.email ?? ""}
        photoUrl={professional?.photo_url}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        {showTrialBanner && (
          <TrialBanner daysLeft={daysLeft!} locale={locale} labels={trialBannerLabels} />
        )}
        <main className="flex-1 overflow-auto lg:pl-0 pt-0">
          <div className="min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
