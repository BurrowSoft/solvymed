import { ReactNode, Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { ReloadButton } from "@/components/ReloadButton";
import { TrialChip, trialChipMessage } from "@/components/TrialChip";
import { getTranslations } from "next-intl/server";
import { isAccessAllowed, trialDaysRemaining, type EffectiveSub } from "@/lib/subscription";
import { greetingFirstName } from "@/lib/doctorName";
import { TourProvider } from "@/components/tour/TourProvider";
import { readTourState, tourEntry } from "@/lib/tourState";
import { SOLVYAI_INTRO_TOUR, solvyAiIntroOn, solvyAiPanelOn } from "@/lib/solvyaiIntro";
import { CURRENT_NEWS, newsTourId } from "@/lib/news";
import { liveFeatures } from "@/lib/liveFeatures";
import { SolvyAi } from "@/components/solvyai/SolvyAi";
import { assistantApiEnabled } from "@/lib/assistant/server/caller";
import { HighlightFromQuery } from "@/components/HighlightFromQuery";
import { SaveMyLocale } from "@/components/SaveMyLocale";
import { countryProfile } from "@/lib/country";
import { getPracticeCountry } from "@/lib/practiceCountry";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { OpenInApp } from "@/components/OpenInApp";
import { BrandMarkTile } from "@/components/BrandLogo";
import { ActingPracticeReset, PracticeSwitcher } from "@/components/PracticeSwitcher";
import { actingPracticeFor, myPractices } from "@/lib/effectiveProfId";
import { ACTING_COOKIE } from "@/lib/actingPractice";

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

  // Only professionals/secretaries belong in this dashboard — allowlist rather
  // than excluding "patient", so an authenticated session with no role at all
  // (e.g. mid-signup, invite not yet resolved) can't fall through to it.
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role, invited_by_professional_id, linked_patient_id")
    .eq("user_id", user!.id)
    .maybeSingle();

  if (roleRow?.role === "patient" && roleRow.linked_patient_id) {
    redirect(`/${locale === "en" ? "" : locale + "/"}my-appointments`);
  }
  if (roleRow?.role === "patient" && roleRow.invited_by_professional_id) {
    // Linked to a doctor's "orbit" but not yet confirmed.
    redirect(`/${locale === "en" ? "" : locale + "/"}auth/pending-confirmation`);
  }
  if (roleRow?.role === "patient") {
    // Neither linked nor invited (removed by the clinic, 147): connect to a
    // doctor (e7).
    redirect(`/${locale === "en" ? "" : locale + "/"}auth/invite-required`);
  }
  if (!roleRow) {
    const metaRole = user!.user_metadata?.role as string | undefined;
    if (metaRole === "patient") {
      // Signed up intending to be a patient, invite code never resolved —
      // send back to the retry form, not a login dead end.
      redirect(`/${locale === "en" ? "" : locale + "/"}auth/invite-required`);
    }
    // No persisted role — no self-heal. A professionals-table row was tried
    // as "proof" of a real professional, but that's unsound: legacy
    // pre-071 signups can have a professionals row regardless of role, so
    // a patient with client-writable user_metadata.role set to
    // "professional" could satisfy that check and self-provision a
    // persisted professional role. There's no server-owned signal that
    // reliably distinguishes "a real professional whose user_roles row is
    // missing" from "any other role-less account" with the current data
    // model, so this falls through to login rather than guessing. A
    // legitimate professional with a missing row needs a real data fix
    // (backfill/migration), not an app-layer auto-repair.
    redirect(`/${locale === "en" ? "" : locale + "/"}auth/login`);
  }
  if (roleRow.role !== "professional" && roleRow.role !== "secretary") {
    redirect(`/${locale === "en" ? "" : locale + "/"}auth/login`);
  }
  const isSecretary = roleRow.role === "secretary";
  // A secretary whose link is NULL (never accepted, removed, or left) has
  // no practice to work in. The DB-owned row is the signal, not metadata.
  if (isSecretary && !roleRow.invited_by_professional_id) {
    redirect(`/${locale === "en" ? "" : locale + "/"}auth/not-connected`);
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
          <BrandMarkTile size="lg" />
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

  if (sub && !isAccessAllowed(sub) && isSecretary) {
    // get_effective_subscription resolves a linked secretary to their
    // doctor's subscription. A secretary can't pay for it, so they never see
    // the paywall, just a note that the doctor's subscription is inactive.
    redirect(`/${locale === "en" ? "" : locale + "/"}auth/clinic-inactive`);
  }
  // A locked doctor (ended trial, failed renewal) still reaches Settings:
  // their data is theirs (export the patient list, manage the subscription,
  // close the account, change the password), and a paywall must never hold
  // it hostage (UX, LGPD/PDPA). Every other section is behind the paywall in
  // (gated)/layout.tsx.

  const daysLeft = trialDaysRemaining(sub);
  // The one trial indicator, for the whole trial (first-run spec §4). A
  // doctor only: its link is Subscribe, which a secretary can't use.
  const showTrialChip = !isSecretary && daysLeft !== null && daysLeft >= 1;
  // ──────────────────────────────────────────────────────────────────────────

  const { data: professional } = await supabase
    .from("professionals")
    .select("full_name, photo_url")
    .eq("id", user.id)
    .maybeSingle();

  // A secretary has no professionals row: use the name they signed up with.
  const ownName = isSecretary
    ? (user.user_metadata?.full_name as string | undefined)?.trim()
    : professional?.full_name;
  // The doctor's own title if they typed one, never one we add
  // (lib/doctorName, the app's rule).
  // Empty when no name is saved yet: the sidebar then shows only the email
  // and a neutral avatar (UX).
  const firstName = greetingFirstName(ownName, user.email);

  // The guided tour (specs/walkthrough.md): auto-start on the first sign-in,
  // a resume offer after leaving mid-tour, or nothing (before migration 113
  // there's no saved state, so nothing starts by itself). The payments step
  // names the practice country's payment QR.
  const tourState = await readTourState(supabase, user.id);
  // The Novidades popup (liveFeatures.news): pending when this release's
  // announcement has no saved state yet (before 113: unavailable, so never).
  const newsPending = liveFeatures.news
    && (await readTourState(supabase, user.id, newsTourId(CURRENT_NEWS.release))).kind === "none";
  // The SolvyAI panel (doctors, not while locked) and "Meet SolvyAI ✦":
  // once SolvyAI is live, where the panel is, until seen (113).
  const panelOn = solvyAiPanelOn({ isSecretary, sub });
  const introPending = solvyAiIntroOn({ isSecretary, sub })
    && (await readTourState(supabase, user.id, SOLVYAI_INTRO_TOUR)).kind === "none";
  // The practice country: the payment QR (doctors) and the two languages
  // offered (country first: its language + English, Vitor 2026-10-01).
  // A secretary acts for the doctor chosen in the switcher (1.5.0, behind
  // the flag), else her primary.
  const actingId = isSecretary ? ((await actingPracticeFor(roleRow.invited_by_professional_id!, user.id)) ?? roleRow.invited_by_professional_id!) : user.id;
  const practice = countryProfile(await getPracticeCountry(supabase, user.id, actingId));
  // The switcher (2+ doctors), or the reset of a choice she no longer serves.
  const practices = isSecretary && liveFeatures.multiPractice ? await myPractices(user.id) : null;
  const chosenCookie = isSecretary && liveFeatures.multiPractice ? (await cookies()).get(ACTING_COOKIE)?.value : undefined;
  // Stale: a doctor she no longer serves, or a list that couldn't be read
  // (the pages would use her primary while the header named the cookie's
  // doctor; 9a). Either way: clear the choice, back on her primary.
  const staleChoice = !!chosenCookie && (!practices || !practices.some((p) => p.professional_id === chosenCookie));
  const paymentQr = isSecretary ? null : practice.paymentQr;

  let trialChipText = "";
  if (showTrialChip) {
    const t = await getTranslations({ locale, namespace: "subscription" });
    const { key, n } = trialChipMessage(daysLeft!);
    trialChipText = t(key, { n });
  }

  // Configurações → Aparência (Help C8): this browser's choice, default
  // Automático (the system setting). The scope holds the tour and SolvyAI
  // overlays too (display: contents keeps the layout as it was).
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <div data-theme={theme} data-theme-root className="contents">
    <TourProvider
      role={isSecretary ? "secretary" : "professional"}
      paymentQr={paymentQr}
      prefix={locale === "en" ? "" : `/${locale}`}
      entry={!isSecretary && sub && !isAccessAllowed(sub) ? null : tourEntry(tourState)}
      resumeStep={tourState.kind === "row" ? tourState.step : 0}
      newsPending={newsPending}
      introPending={introPending}
      introTestable={panelOn && process.env.VERCEL_ENV !== "production"}
    >
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <DashboardSidebar
          locale={locale}
          firstName={firstName}
          email={user.email ?? ""}
          photoUrl={professional?.photo_url}
          isSecretary={isSecretary}
          languages={practice.languages}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="px-4 pt-3 empty:hidden lg:hidden"><OpenInApp onlyWithParam /></div>
          {showTrialChip && (
            // Below lg this row is as tall as the ☰ button's corner (top-4 + 40px),
            // so nothing under it starts beneath the button (Vitor, phone).
            <div className="flex h-14 shrink-0 items-center justify-end pl-16 pr-4 lg:h-auto lg:items-start lg:px-8 lg:pt-3">
              <span data-tour="trial-chip" className="inline-flex">
                <TrialChip daysLeft={daysLeft!} locale={locale} text={trialChipText} />
              </span>
            </div>
          )}
          {/* Below lg the fixed ☰ button sits top left: room for it, so it
              never covers the page title (3e). With SolvyAI, room at the
              bottom too: its fixed button (bottom right) never covers a
              page's last actions, even at 200% zoom (e7). */}
          <main className={`flex-1 overflow-auto lg:pl-0 lg:pt-0 ${showTrialChip ? "pt-2" : "pt-14"}${panelOn ? " pb-24" : ""}`}>
            <div className="min-h-full">
              {staleChoice && <ActingPracticeReset />}
              {!staleChoice && practices && practices.length > 1 && (
                <div className="flex justify-end px-6 pt-4 lg:px-8">
                  <PracticeSwitcher practices={practices} current={actingId} />
                </div>
              )}
              {children}
            </div>
          </main>
        </div>
        {/* SolvyAI (specs/assistant.md): doctors only, behind its flag; its
            panel sits here so it pushes the content on wide screens.
            10 messages a day during the trial, 20 on a paid plan. */}
        {/* Not while locked: only Settings is open then, and SolvyAI acts on the agenda. */}
        {panelOn && (
          <>
            <SolvyAi locale={locale} prefix={locale === "en" ? "" : `/${locale}`} dailyLimit={sub?.subscription_status === "trial" ? 10 : 20} remote={assistantApiEnabled()} paymentQr={paymentQr} />
            {/* The item a SolvyAI save lands on, ringed for 3 s. */}
            <Suspense fallback={null}><HighlightFromQuery /></Suspense>
          </>
        )}
        {/* The language others' pushes and messages reach this user in (117). */}
        <SaveMyLocale locale={locale} />
      </div>
    </TourProvider>
    </div>
  );
}
