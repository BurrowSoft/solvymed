import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

// Shared layout for the Privacy Policy and Terms of Service. The texts exist
// in English and Portuguese (Brazil), the authoritative languages; other
// locales get the English text with a one-line note in their language.

export const LEGAL_LANGS = ["en", "pt-BR"] as const;
export type LegalLang = (typeof LEGAL_LANGS)[number];

export function legalLangFor(locale: string): LegalLang {
  return locale === "pt-BR" ? "pt-BR" : "en";
}

export function LegalDoc({
  locale,
  title,
  updated,
  children,
}: {
  locale: string;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  const lang = legalLangFor(locale);
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        {lang !== locale && <EnglishOnlyNote />}
        <article lang={lang}>
          <div className="mb-10">
            <span className="text-3xl font-black text-teal-600">S</span>
            <h1 className="mt-4 text-3xl font-extrabold text-slate-900">{title}</h1>
            <p className="mt-2 text-sm text-slate-500">{updated}</p>
          </div>
          <div className="prose prose-slate max-w-none">{children}</div>
        </article>
      </div>
    </div>
  );
}

function EnglishOnlyNote() {
  const t = useTranslations("legal");
  return (
    <p className="mb-8 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-100">
      {t("englishOnly")}
    </p>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-bold text-slate-900">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="border-b border-slate-200 py-2 pr-4 font-semibold text-slate-900">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="align-top">
              {row.map((cell, j) => (
                <td key={j} className="border-b border-slate-100 py-2 pr-4">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const Mail = () => (
  <a href="mailto:support@solvymed.com" className="text-teal-600 underline">support@solvymed.com</a>
);
