import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { SubscribeButton } from "@/components/SubscribeButton";
import { isAccessAllowed, trialDaysRemaining, getPlanPrice, type EffectiveSub } from "@/lib/subscription";

export default async function SubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ success?: string; cancelled?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: "subscription" });
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale === "en" ? "" : locale + "/"}auth/login`);

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (roleRow?.role === "patient") redirect(`/${locale === "en" ? "" : locale + "/"}discover`);

  // Fetch effective subscription
  const { data: subRows } = await supabase.rpc("get_effective_subscription", { p_user_id: user.id });
  const sub = (subRows?.[0] ?? null) as EffectiveSub | null;

  // If already active, bounce to dashboard
  if (sub?.subscription_status === "active" && sp.success !== "1") {
    const allowed = isAccessAllowed(sub);
    if (allowed) redirect(`/${locale === "en" ? "" : locale + "/"}dashboard`);
  }

  const daysLeft = trialDaysRemaining(sub);
  const plan = getPlanPrice(locale);
  const isBrazil = plan.provider === "asaas";

  const { data: professional } = await supabase
    .from("professionals")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const userName = (professional?.full_name as string) || undefined;
  const userEmail = (professional?.email as string) ?? user.email ?? undefined;

  const features = [
    t("feature1"),
    t("feature2"),
    t("feature3"),
    t("feature4"),
    t("feature5"),
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-5xl font-black text-teal-600">S</span>
          <p className="mt-1 text-lg font-bold text-slate-800">SolvyMed</p>
        </div>

        {/* Success message */}
        {sp.success === "1" && (
          <div className="mb-6 rounded-xl bg-green-50 border border-green-200 p-4 text-center text-sm text-green-800 font-medium">
            {t("successMessage")}
          </div>
        )}

        {/* Trial status */}
        {daysLeft !== null && daysLeft > 0 && sp.success !== "1" && (
          <div className="mb-6 rounded-xl bg-amber-50 border border-amber-200 p-4 text-center text-sm text-amber-800">
            {t("trialDaysLeft", { n: daysLeft })}
          </div>
        )}
        {(daysLeft === 0 || (sub && sub.subscription_status === "expired")) && sp.success !== "1" && (
          <div className="mb-6 rounded-xl bg-red-50 border border-red-200 p-4 text-center text-sm text-red-800 font-medium">
            {t("trialExpired")}
          </div>
        )}

        {/* Plan card */}
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 overflow-hidden">
          <div className="bg-teal-600 p-6 text-white">
            <h1 className="text-xl font-extrabold">{t("planName")}</h1>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-4xl font-black">{plan.amount}</span>
              <span className="text-teal-200 text-sm">/{t("perMonth")}</span>
            </div>
            <p className="mt-1 text-teal-100 text-xs">{t("planSubtitle")}</p>
          </div>

          <div className="p-6 flex flex-col gap-5">
            {/* Features */}
            <ul className="flex flex-col gap-2.5">
              {features.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <span className="mt-0.5 text-teal-500 text-base leading-none">✓</span>
                  {f}
                </li>
              ))}
            </ul>

            {/* Payment buttons */}
            <div className="flex flex-col gap-3">
              {isBrazil ? (
                <>
                  <SubscribeButton
                    provider="asaas"
                    locale={locale}
                    label={t("payPix")}
                    sublabel={t("payPixSub")}
                    userName={userName}
                    userEmail={userEmail}
                  />
                  <div className="relative flex items-center gap-2">
                    <div className="flex-1 border-t border-slate-200" />
                    <span className="text-xs text-slate-400">{t("or")}</span>
                    <div className="flex-1 border-t border-slate-200" />
                  </div>
                  <SubscribeButton
                    provider="stripe"
                    locale={locale}
                    label={t("payCard")}
                    sublabel={t("payCardSub")}
                    userName={userName}
                    userEmail={userEmail}
                  />
                </>
              ) : (
                <SubscribeButton
                  provider="stripe"
                  locale={locale}
                  label={t("payCard")}
                  sublabel={t("payCardSub")}
                  userName={userName}
                  userEmail={userEmail}
                />
              )}
            </div>

            <p className="text-center text-xs text-slate-400">{t("cancelAnytime")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
