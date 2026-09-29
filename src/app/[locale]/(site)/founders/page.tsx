import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Link } from "@/i18n/navigation";
import { liveFeatures } from "@/lib/liveFeatures";
import { createClient } from "@/lib/supabase/server";
import { defaultFoundersCountry } from "@/lib/founders";
import { readPlaces, type Place } from "@/lib/foundersPlaces";
import { FoundersForm } from "./FoundersForm";
import { FoundersPageView } from "./FoundersPageView";

// The Founders Program page (integrations/founders-page-spec.md, stage 1):
// what founders get and give, how it works, the live places per system,
// the application form, the FAQ. Public marketing, off until
// liveFeatures.founders (Vitor's OK, migration 129, the mailbox, the
// privacy line, the Thai review). The rules link waits for the lawyer.

const BASE = "https://www.solvymed.com";
const pathFor = (locale: string) => (locale === "en" ? `${BASE}/founders` : `${BASE}/${locale}/founders`);

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "founders" });
  return { title: t("metaTitle"), description: t("metaDescription"), alternates: { canonical: pathFor(locale) } };
}

// Refreshed at most once a minute (the counts are public, never personal).
export const revalidate = 60;

function PlacesList({ title, places, t }: { title: string; places: Place[] | null; t: (k: string, v?: Record<string, string | number>) => string }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h3>
      {places === null ? (
        <p className="text-sm text-slate-500">{t("placesUnavailable")}</p>
      ) : (
        <ul className="space-y-1.5">
          {places.map((p) => (
            <li key={p.system} className="text-sm text-slate-700">
              {p.placesLeft === null
                ? p.name
                : p.placesLeft > 0
                  ? t("placesLeft", { system: p.name, n: p.placesLeft, capacity: p.capacity ?? 5 })
                  : t("placesFull", { system: p.name })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function FoundersPage({ params }: { params: Promise<{ locale: string }> }) {
  if (!liveFeatures.founders) notFound();
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "founders" });
  const db = await createClient();
  const [br, th] = await Promise.all([readPlaces(db, "BR"), readPlaces(db, "TH")]);

  const get = [t("get1"), t("get2"), t("get3")];
  const ask = [t("ask1"), t("ask2"), t("ask3")];
  const how = [1, 2, 3].map((n) => ({ title: t(`how${n}Title`), text: t(`how${n}`) }));
  const faq = [1, 2, 3, 4, 5].map((n) => ({ q: t(`faq${n}q`), a: t(`faq${n}a`) }));
  const tt = (k: string, v?: Record<string, string | number>) => t(k, v);

  return (
    <>
      <SiteHeader />
      <FoundersPageView locale={locale} />
      <main className="bg-slate-50">
        <section className="mx-auto max-w-5xl px-4 py-16 text-center md:py-24">
          <h1 className="mb-4 text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">{t("heroTitle")}</h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-slate-600">{t("heroLead")}</p>
          <a href="#apply" className="inline-block rounded-xl bg-teal-600 px-8 py-3.5 text-base font-bold text-white shadow transition hover:bg-teal-700">
            {t("heroCta")}
          </a>
        </section>

        <section className="mx-auto grid max-w-5xl gap-6 px-4 pb-14 md:grid-cols-2">
          {[{ title: t("getTitle"), items: get }, { title: t("askTitle"), items: ask }].map((b) => (
            <div key={b.title} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
              <h2 className="mb-4 text-xl font-bold text-slate-900">{b.title}</h2>
              <ul className="space-y-3">
                {b.items.map((i) => (
                  <li key={i} className="flex items-start gap-3 text-slate-700">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-14">
          <h2 className="mb-5 text-xl font-bold text-slate-900">{t("howTitle")}</h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {how.map((s, i) => (
              <li key={s.title} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
                <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-teal-600 text-sm font-bold text-white">{i + 1}</span>
                <p className="text-slate-700"><strong>{s.title}</strong>: {s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-5xl px-4 pb-14">
          <h2 className="mb-5 text-xl font-bold text-slate-900">{t("placesTitle")}</h2>
          <div className="grid gap-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 md:grid-cols-2">
            <PlacesList title={t("countryBR")} places={br} t={tt} />
            <PlacesList title={t("countryTH")} places={th} t={tt} />
          </div>
        </section>

        <section id="apply" className="mx-auto max-w-2xl scroll-mt-20 px-4 pb-14">
          <h2 className="mb-5 text-xl font-bold text-slate-900">{t("formTitle")}</h2>
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <FoundersForm locale={locale} defaultCountry={defaultFoundersCountry(locale)} showRulesLink={liveFeatures.foundersRules} />
            <p className="mt-5 text-xs leading-relaxed text-slate-500">
              {t.rich("privacyNotice", { privacy: (c) => <Link href="/privacy" className="underline">{c}</Link> })}
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-2xl px-4 pb-20">
          <h2 className="mb-5 text-xl font-bold text-slate-900">{t("faqTitle")}</h2>
          <div className="divide-y divide-slate-200 rounded-2xl bg-white ring-1 ring-slate-100">
            {faq.map((item) => (
              <details key={item.q} className="group p-5">
                <summary className="cursor-pointer list-none font-semibold text-slate-900 marker:hidden">{item.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.a}</p>
              </details>
            ))}
          </div>
          {liveFeatures.foundersRules && (
            <p className="mt-6 text-center">
              <Link href="/founders/rules" className="font-semibold text-teal-700 underline">{t("rulesLink")}</Link>
            </p>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
