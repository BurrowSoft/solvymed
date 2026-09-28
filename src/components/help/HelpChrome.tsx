import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { HELP_UI, inlineSegments, type HelpBlock, type HelpLang } from "@/lib/help";

// The Help Center's frame. Opened from the apps (?app=1) it's bare: no
// Pricing link, no sign-up button, no prices anywhere (store rules,
// specs/assistant.md §4). Otherwise the public site's header and footer.
export function HelpFrame({ app, lang, children }: { app: boolean; lang: HelpLang; children: ReactNode }) {
  const ui = HELP_UI[lang];
  return (
    <>
      {app ? (
        <header className="border-b border-slate-100 bg-white">
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-4">
            <img src="/solvymed_logo.png" alt="" className="h-7 w-7 rounded-lg" />
            <span className="font-bold text-slate-900">{ui.title}</span>
          </div>
        </header>
      ) : (
        <SiteHeader />
      )}
      <main className="min-h-[60vh] bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-10 md:py-14">{children}</div>
      </main>
      {app ? (
        <footer className="border-t border-slate-100 bg-white py-6 text-center text-sm text-slate-500">
          {ui.support} <a href="mailto:support@solvymed.com" className="font-semibold text-teal-700">support@solvymed.com</a>
        </footer>
      ) : (
        <SiteFooter />
      )}
    </>
  );
}

// Help links keep the app flag.
export function HelpLink({ href, app, className, children }: { href: string; app: boolean; className?: string; children: ReactNode }) {
  return (
    <Link href={app ? `${href}?app=1` : href} className={className}>
      {children}
    </Link>
  );
}

export function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineSegments(text).map((s, i) => (s.bold ? <strong key={i} className="font-semibold text-slate-900">{s.text}</strong> : <span key={i}>{s.text}</span>))}
    </>
  );
}

export function HelpBlocks({ blocks }: { blocks: HelpBlock[] }) {
  return (
    <div className="space-y-3 text-slate-700 leading-relaxed">
      {blocks.map((b, i) =>
        b.type === "ol" ? (
          <ol key={i} className="list-decimal space-y-1.5 pl-6">
            {b.items.map((item, j) => <li key={j}><Inline text={item} /></li>)}
          </ol>
        ) : (
          <p key={i}><Inline text={b.text} /></p>
        ),
      )}
    </div>
  );
}
