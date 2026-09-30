import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { SubscribeButton } from "@/components/SubscribeButton";
import { UpdateCardButton } from "@/components/UpdateCardButton";
import { isAccessAllowed, isPaidActive, trialDaysRemaining, getPlanPrice, type EffectiveSub } from "@/lib/subscription";
import { lookupPracticeCountry } from "@/lib/practiceCountry";
import { ActivationStatus } from "./ActivationStatus";
import { SignOutButton } from "@/components/SignOutButton";
import { SubscribeHeader } from "./SubscribeHeader";
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
  const tNav = await getTranslations({ locale, namespace: "nav" });
  const tClose = await getTranslations({ locale, namespace: "accountClose" });
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
  // A secretary never sees the paywall: they can't pay for their doctor's
  // subscription. The dashboard layout routes them (working, not connected,
  // or "subscription inactive").
  if (roleRow?.role === "secretary") redirect(`/${locale === "en" ? "" : locale + "/"}dashboard`);
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
  // Priced by the practice's country (only a doctor subscribes here). Money
  // fails closed: if the country can't be read (other than "no country
  // column yet"), no price and no checkout, rather than the wrong currency.
  const countryLookup = await lookupPracticeCountry(supabase, user.id, user.id);
  const plan = countryLookup.ok ? getPlanPrice(countryLookup.country) : null;
  // The way out of every state (Vitor, live test): the dashboard while it
  // lets them in; none when it wouldn't (see SubscribeHeader).
  const prefix = locale === "en" ? "" : `/${locale}`;
  // Not "just paid": an ended trial back from checkout before the webhook
  // lands would bounce from the dashboard to this paywall (9a).
  const canEnter = !!sub && isAccessAllowed(sub);
  const exitHref = canEnter ? `${prefix}/dashboard` : null;
  // Locked out (an ended trial, a failed renewal): a way to get help and
  // to close the account, which Settings can't offer while it's locked.
  const locked = !!sub && !isAccessAllowed(sub) && sp.success !== "1";

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
        <SubscribeHeader exitHref={exitHref} backLabel={t("back")} />

        {/* Back from checkout: "activated" only once the database says so
            (the webhook writes it); until then "activating…". */}
        {sp.success === "1" && <ActivationStatus initiallyActive={isPaidActive(sub)} dashboardHref={`${prefix}/dashboard`} canGoBack={canEnter} />}

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

        {/* Plan card (not once they've just paid: they're subscribed) */}
        {sp.success !== "1" && <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 overflow-hidden">
          <div className="bg-teal-600 p-6 text-white">
            <h1 className="text-xl font-extrabold">{t("planName")}</h1>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-4xl font-black">{plan ? plan.amount : "—"}</span>
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
              {/* Just paid: never offer a second checkout while it activates. */}
              {activating || sp.success === "1" ? null : !plan ? (
                <p className="text-center text-sm text-red-600">{t("errorCheckFailed")}</p>
              ) : paymentFailed ? (
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
        </div>}

        {locked && (
          <p className="mt-6 text-center text-sm text-slate-600">
            {t("needHelp")} <a href="mailto:support@solvymed.com" className="font-semibold text-teal-700 underline">support@solvymed.com</a>
            {" · "}
            <a href={`${prefix}/account/delete`} className="text-slate-500 underline">{tClose("titleClose")}</a>
          </p>
        )}
        {/* Every state: a way to sign out (Vitor was stuck on the paywall). */}
        <div className="mt-4 flex justify-center">
          <SignOutButton label={tNav("signOut")} />
        </div>

        {/* Locked: Settings stays open (export, subscription, close the
            account, password); the rest of the dashboard doesn't. */}
        {sub && !isAccessAllowed(sub) && sp.success !== "1" && (
          <p className="mt-6 text-center text-sm text-slate-600">
            {t("lockedSettingsHint")}{" "}
            <a href={`/${locale === "en" ? "" : locale + "/"}dashboard/settings`} className="font-semibold text-teal-700 underline">{t("lockedSettingsLink")}</a>
          </p>
        )}
      </div>
    </div>
  );
}
