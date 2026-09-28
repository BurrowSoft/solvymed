"use client";

import { useMemo, useState } from "react";
import { articleSlug, articleTitle, HELP_UI, searchHelp, type HelpLang } from "@/lib/help";
import { HelpLink } from "./HelpChrome";

// Instant search over the articles (plain text, no AI), per specs/assistant.md.
export function HelpSearch({ lang, app }: { lang: HelpLang; app: boolean }) {
  const ui = HELP_UI[lang];
  const [q, setQ] = useState("");
  const results = useMemo(() => searchHelp(q, lang, app), [q, lang, app]);
  return (
    <div className="mb-10">
      <label htmlFor="help-search" className="sr-only">{ui.search}</label>
      <input
        id="help-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={ui.searchPlaceholder}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
      />
      {q.trim() && (
        <div className="mt-3 rounded-xl bg-white p-2 ring-1 ring-slate-100" aria-live="polite">
          {results.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">{ui.noResults}</p>
          ) : (
            <ul>
              {results.map((a) => (
                <li key={a.id}>
                  <HelpLink href={`/help/${articleSlug(a)}`} app={app} className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
                    {articleTitle(a, lang, app)}
                  </HelpLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
