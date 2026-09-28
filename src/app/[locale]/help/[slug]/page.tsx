import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HelpBlocks, HelpFrame, HelpLink, Inline } from "@/components/help/HelpChrome";
import { articleTitle, findArticle, HELP_UI, helpLang, webScreen } from "@/lib/help";
import { liveFeatures } from "@/lib/liveFeatures";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ app?: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const app = (await searchParams).app === "1";
  const found = findArticle(slug);
  const lang = helpLang(locale);
  return {
    // The app variant's neutral title (no "subscription" in the apps).
    title: found ? articleTitle(found.article, lang, app) : HELP_UI[lang].title,
    // Not indexed until UX confirms the label check (liveFeatures.helpCenter).
    robots: liveFeatures.helpCenter ? undefined : { index: false, follow: false },
  };
}

export default async function HelpArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ app?: string }>;
}) {
  const { locale, slug } = await params;
  const app = (await searchParams).app === "1";
  const found = findArticle(slug);
  if (!found) notFound();
  const { article, category } = found;
  const lang = helpLang(locale);
  const ui = HELP_UI[lang];
  // No "Open on the website" in the app variant, nor when the website
  // doesn't have the feature.
  const screen = app || article.webUnavailable ? null : webScreen(article.open);

  return (
    <HelpFrame app={app} lang={lang}>
      <HelpLink href="/help" app={app} className="text-sm font-semibold text-slate-500 hover:text-slate-700">{ui.back}</HelpLink>
      <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-teal-600">{category.title[lang]}</p>
      <h1 className="mt-1 mb-6 text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">{articleTitle(article, lang, app)}</h1>

      <article className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
        {app && article.appOnly ? (
          // Opened from the apps: the store-safe text only (no prices,
          // buying or subscribing on the website).
          <p className="text-slate-700">{article.appOnly[lang]}</p>
        ) : (
          <>
            <HelpBlocks blocks={article.body[lang]} />
            {/* Web notes are for website readers; the app variant (opened in
                the app) shows and searches only the app text (UX). */}
            {article.web && !app && (
              <div className="mt-6 rounded-xl bg-slate-50 p-4">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{ui.onTheWebsite}</p>
                <p className="text-sm leading-relaxed text-slate-700"><Inline text={article.web[lang]} /></p>
              </div>
            )}
            {screen && (
              <a href={`${locale === "en" ? "" : `/${locale}`}${screen}`} className="mt-6 inline-block rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700">
                {ui.openOnWebsite}
              </a>
            )}
          </>
        )}
      </article>

      <p className="mt-8 text-sm text-slate-500">
        {ui.support} <a href="mailto:support@solvymed.com" className="font-semibold text-teal-700">support@solvymed.com</a>
      </p>
    </HelpFrame>
  );
}
