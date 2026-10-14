import type { Metadata } from "next";
import { HelpFrame, HelpLink } from "@/components/help/HelpChrome";
import { HelpSearch } from "@/components/help/HelpSearch";
import { articleSlug, articleTitle, helpData, HELP_UI, helpView } from "@/lib/help";
import { liveFeatures } from "@/lib/liveFeatures";
import { viewerVideoTutorialsUrl } from "@/lib/videoTutorialsServer";

// Not indexed (and not linked) until UX confirms the label check
// (liveFeatures.helpCenter); the app-opened variant is never indexed.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const ui = HELP_UI[helpView(locale)];
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
  const view = helpView(locale);
  const { cats, lang } = helpData(view);
  const ui = HELP_UI[view];
  // "Video tutorials" (specs/video-tutorials.md): the viewer's playlist, a
  // link out. Not in the app-opened view: the app has its own row.
  const videos = app ? null : await viewerVideoTutorialsUrl(locale);
  return (
    <HelpFrame app={app} lang={view}>
      <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-slate-900">{ui.title}</h1>
      <p className="mb-8 text-slate-500">{ui.subtitle}</p>
      {videos && (
        <a href={videos} target="_blank" rel="noopener noreferrer" data-testid="help-video-tutorials"
          className="mb-8 flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 transition hover:ring-teal-200">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              <rect x="2" y="5" width="20" height="14" rx="3" /><polygon points="10 9 15 12 10 15 10 9" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-slate-900">{ui.videos}</span>
            <span className="block text-sm text-slate-500">{ui.videosSubtitle}</span>
          </span>
          <span aria-hidden="true" className="text-slate-300">↗</span>
        </a>
      )}
      <HelpSearch view={view} app={app} />
      <div className="grid gap-6 sm:grid-cols-2">
        {cats.map((c) => (
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
