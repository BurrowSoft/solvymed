import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { SignupCta } from "@/components/SignupCta";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Link } from "@/i18n/navigation";
import { liveFeatures, pdfsInLocale } from "@/lib/liveFeatures";
import { pricingCountry, pricingCountryCode, type PricingChoice } from "@/lib/pricingCountry";
import { thaiEnabled } from "@/lib/publicLocales";
import { getPlanPrice } from "@/lib/subscription";
import { localeAlternates } from "@/lib/seo";


// Its own canonical and hreflang set (lib/seo).
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pricing" });
  return {
    title: t("navLabel"),
    description: t("subtitle"),
    alternates: localeAlternates(locale, "/pricing"),
  };
}

// The country switcher's options (from the Thai release on). Country
// names in their own language, as in the signup picker.
const SWITCHER: { choice: PricingChoice; label: string | null }[] = [
  { choice: "BR", label: "Brasil" },
  { choice: "TH", label: "ประเทศไทย" },
  { choice: "OTHER", label: null },
];

export default async function PricingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { locale } = await params;
  const { c } = await searchParams;
  const t = await getTranslations("pricing");
  const geo = (await headers()).get("x-vercel-ip-country");
  const choice = pricingCountry({ chosen: c, geo });
  // The same table checkout charges from (never a second hard-coded price).
  const plan = getPlanPrice(pricingCountryCode(choice));

  // Only what's live today is claimed (lib/liveFeatures).
  const paymentsKey = choice === "BR" ? "BR" : choice === "TH" && liveFeatures.promptPay ? "TH" : "OTHER";
  const features = [
    t("f.schedule"),
    t("f.patients"),
    t("f.patientApp"),
    t("f.secretaries"),
    t(`f.payments.${paymentsKey}`),
    ...(pdfsInLocale(locale) ? [t("f.pdfs")] : []),
    t("f.reminders"),
    liveFeatures.iosApp ? t("f.devices") : t("f.devicesAndroid"),
    t("f.security"),
    ...(liveFeatures.solvyAi ? [t("f.solvyai")] : []),
  ];
  const faq = (["1", "2", "3", "4"] as const).map((n) => ({ q: t(`faq.q${n}`), a: t(`faq.a${n}`) }));

  return (
    <>
      <SiteHeader />
      <main className="bg-slate-50">
        <section className="mx-auto max-w-5xl px-4 py-16 md:py-24">
          <div className="mb-10 text-center">
            <h1 className="mb-4 text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">{t("title")}</h1>
            <p className="mx-auto max-w-2xl text-lg text-slate-500">{t("subtitle")}</p>
          </div>

          {thaiEnabled && (
            <nav aria-label={t("countryLabel")} className="mb-8 flex flex-wrap items-center justify-center gap-2 text-sm">
              <span className="text-slate-500">{t("countryLabel")}</span>
              {SWITCHER.map((s) => (
                <Link
                  key={s.choice}
                  href={{ pathname: "/pricing", query: { c: s.choice } }}
                  aria-current={s.choice === choice ? "true" : undefined}
                  className={`rounded-full border px-3 py-1 font-semibold transition ${s.choice === choice ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-teal-300"}`}
                >
                  {s.label ?? t("countryOther")}
                </Link>
              ))}
            </nav>
          )}

          <div className="mx-auto max-w-md overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
            <div className="bg-teal-600 p-8 text-center text-white">
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-100">SolvyMed Pro</p>
              <p className="mt-2 flex items-baseline justify-center gap-1">
                <span className="text-5xl font-black">{plan.amount}</span>
                <span className="text-teal-100">{t("perMonth")}</span>
              </p>
              <p className="mt-3 text-sm text-teal-50">
                {t("trial")} {t("trialNoCard")}
              </p>
            </div>
            <div className="flex flex-col gap-4 p-8">
              <SignupCta
                label={t("cta")}
                className="block rounded-xl bg-teal-600 px-6 py-3 text-center text-base font-bold text-white shadow transition hover:bg-teal-700"
              />
              <p className="text-center text-xs text-slate-400">{t("cancel")}</p>
            </div>
          </div>

          <div className="mx-auto mt-14 max-w-2xl">
            <h2 className="mb-5 text-xl font-bold text-slate-900">{t("includedTitle")}</h2>
            <ul className="grid gap-3">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-slate-700">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <div className="mx-auto mt-14 max-w-2xl">
            <h2 className="mb-5 text-xl font-bold text-slate-900">{t("faqTitle")}</h2>
            <div className="divide-y divide-slate-200 rounded-2xl bg-white ring-1 ring-slate-100">
              {faq.map((item) => (
                <details key={item.q} className="group p-5">
                  <summary className="cursor-pointer list-none font-semibold text-slate-900 marker:hidden">{item.q}</summary>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
