import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Link } from "@/i18n/navigation";
import { liveFeatures } from "@/lib/liveFeatures";

// The Founders Program rules (the brief's "Program rules", verbatim per
// language). Published only after the lawyer's check (foundersRules);
// until then the page says they're coming.

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "founders" });
  return { title: t("rulesTitle") };
}

export default async function FoundersRulesPage({ params }: { params: Promise<{ locale: string }> }) {
  if (!liveFeatures.founders) notFound();
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "founders" });
  const b = { b: (c: React.ReactNode) => <strong>{c}</strong> };

  return (
    <>
      <SiteHeader />
      <main className="bg-slate-50">
        <section className="mx-auto max-w-3xl px-4 py-16">
          <h1 className="mb-8 text-3xl font-extrabold tracking-tight text-slate-900">{t("rulesTitle")}</h1>
          {liveFeatures.foundersRules ? (
            <ol className="list-decimal space-y-4 pl-6 text-slate-700">
              {[1, 2].map((n) => <li key={n}>{t.rich(`rule${n}`, b)}</li>)}
              <li>
                {t.rich("rule3", b)}
                <ol className="mt-2 list-[lower-alpha] space-y-1 pl-6">
                  {["a", "b", "c"].map((x) => <li key={x}>{t.rich(`rule3${x}`, b)}</li>)}
                </ol>
              </li>
              {[4, 5, 6, 7, 8].map((n) => <li key={n}>{t.rich(`rule${n}`, b)}</li>)}
            </ol>
          ) : (
            <p className="text-slate-600">{t("rulesSoon")}</p>
          )}
          <p className="mt-10">
            <Link href="/founders" className="font-semibold text-teal-700 underline">← {t("metaTitle")}</Link>
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
