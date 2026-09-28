import type { Metadata } from "next";
import { HelpFrame, HelpLink } from "@/components/help/HelpChrome";
import { HelpSearch } from "@/components/help/HelpSearch";
import { articleSlug, articleTitle, HELP, HELP_UI, helpLang } from "@/lib/help";
import { liveFeatures } from "@/lib/liveFeatures";

// Not indexed (and not linked) until UX confirms the label check
// (liveFeatures.helpCenter); the app-opened variant is never indexed.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const ui = HELP_UI[helpLang(locale)];
  return {
    title: ui.title,
    description: ui.subtitle,
    robots: liveFeatures.helpCenter ? undefined : { index: false, follow: false },
  };
}

export default async function HelpIndex({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ app?: string }>;
}) {
  const { locale } = await params;
  const app = (await searchParams).app === "1";
  const lang = helpLang(locale);
  const ui = HELP_UI[lang];
  return (
    <HelpFrame app={app} lang={lang}>
      <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-slate-900">{ui.title}</h1>
      <p className="mb-8 text-slate-500">{ui.subtitle}</p>
      <HelpSearch lang={lang} app={app} />
      <div className="grid gap-6 sm:grid-cols-2">
        {HELP.map((c) => (
          <section key={c.slug} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
            <h2 className="mb-3 text-lg font-bold text-slate-900">{c.title[lang]}</h2>
            <ul className="space-y-1.5">
              {c.articles.map((a) => (
                <li key={a.id}>
                  <HelpLink href={`/help/${articleSlug(a)}`} app={app} className="text-sm text-teal-700 hover:underline">
                    {articleTitle(a, lang, app)}
                  </HelpLink>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </HelpFrame>
  );
}
