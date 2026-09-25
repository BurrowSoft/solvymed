import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { SubscribeButton } from "@/components/SubscribeButton";
import { UpdateCardButton } from "@/components/UpdateCardButton";
import { isAccessAllowed, trialDaysRemaining, getPlanPrice, type EffectiveSub } from "@/lib/subscription";
import { retrieveStoredStripeSubscription, isLive, needsCardFix } from "@/lib/stripeBilling";

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
    .select("role, invited_by_professional_id, linked_patient_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (roleRow?.role === "patient" && roleRow.linked_patient_id) {
    redirect(`/${locale === "en" ? "" : locale + "/"}my-appointments`);
  }
  if (roleRow?.role === "patient" && roleRow.invited_by_professional_id) {
    redirect(`/${locale === "en" ? "" : locale + "/"}auth/pending-confirmation`);
  }
  if (roleRow?.role === "patient") redirect(`/${locale === "en" ? "" : locale + "/"}my-appointments`);
  if (!roleRow?.role && user.user_metadata?.role === "patient") {
    // Pending patient (invite code never resolved) — don't let them into the
    // professional subscription flow, send back to the retry form.
    redirect(`/${locale === "en" ? "" : locale + "/"}auth/invite-required`);
  }

  // Fetch effective subscription
  const { data: subRows } = await supabase.rpc("get_effective_subscription", { p_user_id: user.id });
  const sub = (subRows?.[0] ?? null) as EffectiveSub | null;

  // If already active, bounce to dashboard
  if (sub?.subscription_status === "active" && sp.success !== "1") {
    const allowed = isAccessAllowed(sub);
    if (allowed) redirect(`/${locale === "en" ? "" : locale + "/"}dashboard`);
  }

  // A failed renewal is stored as "expired", same as an ended trial. Ask
  // Stripe so the doctor sees "your payment failed" with a way to fix the
  // card, instead of a trial paywall and a button that would start a second
  // subscription. Only checked when access is denied, so active users never
  // cost a Stripe call. If the lookup fails, the normal page shows, and the
  // checkout route still refuses a second subscription (fails closed).
  let paymentFailed = false;
  // Stripe already reports the subscription live (e.g. back from the
  // portal after fixing the card), but the webhook hasn't updated the row
  // yet. Say so instead of offering a checkout the route would refuse.
  let activating = false;
  if (sub && !isAccessAllowed(sub)) {
    try {
      const stored = await retrieveStoredStripeSubscription(sub);
      if (stored) {
        activating = isLive(stored);
        paymentFailed = needsCardFix(stored);
      }
    } catch (err) {
      console.error("Subscribe page: could not check Stripe subscription status", err);
    }
  }

  const daysLeft = trialDaysRemaining(sub);
  const plan = getPlanPrice(locale);

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
        {paymentFailed && sp.success !== "1" && (
          <div className="mb-6 rounded-xl bg-red-50 border border-red-200 p-4 text-center text-sm text-red-800 font-medium">
            {t("paymentFailed")}
          </div>
        )}
        {activating && sp.success !== "1" && (
          <div className="mb-6 rounded-xl bg-green-50 border border-green-200 p-4 text-center text-sm text-green-800 font-medium">
            {t("paymentActivating")}
          </div>
        )}
        {!paymentFailed && !activating && (daysLeft === 0 || (sub && sub.subscription_status === "expired")) && sp.success !== "1" && (
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
              {activating ? null : paymentFailed ? (
                // Fix the card on the existing subscription. Never offer a
                // new checkout here: Stripe is still retrying the old one.
                roleRow?.role === "professional" ? (
                  <UpdateCardButton locale={locale} />
                ) : (
                  <p className="text-center text-sm text-slate-500">{t("paymentFailedAskOwner")}</p>
                )
              ) : (
                <SubscribeButton
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
